const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

async function enviarMensagemAPI(numero, texto) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const url = `${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`;
        await axios.post(url, {
            number: numeroLimpo,
            options: { delay: 1200, presence: "composing", linkPreview: false },
            textMessage: { text: texto }
        }, { headers: whatsappConfig.headers });
        return true;
    } catch (error) {
        console.error(`❌ Erro Evolution API (${numeroLimpo}):`, error.response?.data || error.message);
        return false;
    }
}

async function obterMensagemFormatada(agendamento) {
    // 1. PRIORIDADE: Mensagem personalizada escrita na consulta
    if (agendamento.mensagem_personalizada) {
        return agendamento.mensagem_personalizada; 
    }

    const mapaSlugs = {
        'confirmacao': 'confirmation',
        'lembrete_24h': '24h_before',
        'pos_venda': 'post_appointment'
    };

    const slugBusca = mapaSlugs[agendamento.tipo_mensagem] || agendamento.tipo_mensagem || 'confirmation';

    // 2. BUSCA O TEMPLATE: Filtra por SLUG e pelo USER_ID do dono da conta
    const { data: template } = await supabase
        .from('templates')
        .select('conteudo')
        .eq('slug', slugBusca)
        .eq('user_id', agendamento.user_id) 
        .single();

    // 3. FALLBACK: Se o usuário não criou template, usa o padrão do sistema
    let textoBase = template?.conteudo || "Olá {nome}, confirmamos seu horário de {servico} para {data} às {hora}.";

    const dataObj = new Date(agendamento.data_envio);
    const dataF = !isNaN(dataObj) ? dataObj.toLocaleDateString('pt-BR') : "";
    const horaF = !isNaN(dataObj) ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "";

    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'atendimento');
}

const verificarEEnviarTudo = async () => {
    const agora = new Date();
    console.log(`--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO [${agora.toLocaleString()}] ---`);

    try {
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente') 
            .lte('data_envio', agora.toISOString()); 

        if (error) throw error;

        if (lembretes && lembretes.length > 0) {
            console.log(`📦 Encontrados ${lembretes.length} lembretes.`);
            for (let ag of lembretes) {
                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemAPI(ag.telefone, msg);
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Sucesso para: ${ag.nome}`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };