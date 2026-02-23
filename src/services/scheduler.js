const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

// Função auxiliar para enviar via Evolution API
async function enviarMensagemAPI(numero, texto) {
    const formattedNumber = numero.replace(/\D/g, '');
    try {
        await axios.post(`${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`, {
            number: formattedNumber,
            text: texto
        }, { headers: whatsappConfig.headers });
        return true;
    } catch (error) {
        console.error(`❌ Erro ao disparar para ${numero}:`, error.response?.data || error.message);
        return false;
    }
}

function formatarMensagem(template, agendamento) {
    if (!template) return "Olá! Passando para lembrar da sua consulta.";
    const dataObj = new Date(agendamento.data_hora);
    return template
        .replace(/{nome}/g, agendamento.paciente_nome)
        .replace(/{data}/g, dataObj.toLocaleDateString('pt-BR'))
        .replace(/{hora}/g, dataObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        .replace(/{profissional}/g, agendamento.profissional_nome || "Equipe FormulaPé");
}

const verificarEEnviarTudo = async () => {
    console.log("--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO (via Evolution API) ---");
    const agora = new Date();
    const limiteAmanha = new Date(agora.getTime() + (24 * 60 * 60 * 1000)); 

    try {
        const { data: templates } = await supabase.from('templates').select('*');

        // --- LÓGICA 1: LEMBRETE 24H ANTES ---
        const { data: lembretes } = await supabase.from('agendamentos')
            .select('*')
            .eq('status_lembrete_24h', 'pendente')
            .lte('data_hora', limiteAmanha.toISOString()) 
            .gt('data_hora', agora.toISOString());        

        if (lembretes?.length > 0) {
            const tplLembrete = templates?.find(t => t.slug === 'lembrete_24h')?.conteudo;
            for (let ag of lembretes) {
                const msg = formatarMensagem(tplLembrete, ag);
                const enviado = await enviarMensagemAPI(ag.whatsapp, msg);
                
                if (enviado) {
                    await supabase.from('agendamentos').update({ status_lembrete_24h: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Lembrete 24h enviado: ${ag.paciente_nome}`);
                }
            }
        }

        // --- LÓGICA 2: PÓS-CONSULTA ---
        const { data: pos } = await supabase.from('agendamentos')
            .select('*')
            .eq('status_pos_consulta', 'pendente')
            .lt('data_hora', agora.toISOString()); 

        if (pos?.length > 0) {
            const tplPos = templates?.find(t => t.slug === 'pos_consulta')?.conteudo;
            for (let ag of pos) {
                const msg = formatarMensagem(tplPos, ag);
                const enviado = await enviarMensagemAPI(ag.whatsapp, msg);
                
                if (enviado) {
                    await supabase.from('agendamentos').update({ status_pos_consulta: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Pós-consulta enviado: ${ag.paciente_nome}`);
                }
            }
        }

    } catch (err) {
        console.error("❌ Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };