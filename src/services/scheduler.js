const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

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
    if (!template) return `Olá ${agendamento.paciente_nome}! Passando para lembrar da sua consulta.`;
    const dataObj = new Date(agendamento.data_hora);
    return template
        .replace(/{nome}/g, agendamento.paciente_nome)
        .replace(/{data}/g, dataObj.toLocaleDateString('pt-BR'))
        .replace(/{hora}/g, dataObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        .replace(/{servico}/g, agendamento.serviço || "Atendimento");
}

const verificarEEnviarTudo = async () => {
    console.log("--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO ---");
    const agora = new Date();
    const limiteAmanha = new Date(agora.getTime() + (24 * 60 * 60 * 1000)); 

    try {
        // 1. Busca os templates (se não tiver a tabela, isso vai dar erro, veja nota abaixo)
        const { data: templates } = await supabase.from('templates').select('*');

        // 2. BUSCA COM ASPAS DUPLAS PARA ESCAPAR O NOME DA TABELA
        const { data: lembretes, error } = await supabase
            .from('"FormulaPe-whatsapp"') // AQUI ESTÁ O PULO DO GATO: '"Nome"'
            .select('*')
            .eq('status_lembrete', 'pendente') 
            .lte('data_hora', limiteAmanha.toISOString()) 
            .gt('data_hora', agora.toISOString());        

        if (error) {
            console.error("❌ Erro ao buscar agendamentos:", error.message);
            return;
        }

        if (lembretes?.length > 0) {
            // Se você não tiver a tabela templates, vamos usar um texto padrão:
            const tplLembrete = templates?.find(t => t.slug === 'lembrete_24h')?.conteudo;
            
            for (let ag of lembretes) {
                const msg = formatarMensagem(tplLembrete, ag);
                const enviado = await enviarMensagemAPI(ag.WhatsApp, msg);
                
                if (enviado) {
                    await supabase
                        .from('"FormulaPe-whatsapp"') // ASPAS AQUI TAMBÉM
                        .update({ status_lembrete: 'enviado' })
                        .eq('id', ag.id);
                    console.log(`✅ Lembrete enviado para: ${ag.paciente_nome}`);
                }
            }
        } else {
            console.log("📌 Nenhum lembrete pendente encontrado.");
        }

    } catch (err) {
        console.error("❌ Erro crítico no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };