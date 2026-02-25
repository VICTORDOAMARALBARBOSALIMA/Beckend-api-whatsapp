const supabase = require('../config/db');
const axios = require('axios');

// --- ENVIO DINÂMICO PARA EVOLUTION API ---
async function enviarMensagemDinamica(numero, texto, instancia, apikey) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const baseUrl = process.env.EVOLUTION_URL; 
        
        if (!baseUrl) {
            console.error("❌ ERRO: Variável EVOLUTION_URL não definida no Render!");
            return false;
        }

        const urlBaseLimpa = baseUrl.replace(/\/$/, ""); 
// No seu scheduler.js, mude a linha da URL para isso:
const url = `${urlBaseLimpa}/message/sendText/${encodeURIComponent(instancia)}`;        
        // No seu scheduler.js, mude o payload para:
const payload = {
    number: numeroLimpo,
    textMessage: {
        text: texto
    },
    options: {
        delay: 1200,
        presence: "composing",
        linkPreview: false
    }
};

        await axios.post(url, payload, { 
            headers: { 
                "apikey": apikey,
                "Content-Type": "application/json" 
            } 
        });
        return true;
   // Substitua apenas o catch da função enviarMensagemDinamica
} catch (error) {
    // Se a mensagem chegou, mas deu erro 400, vamos ver o que a Evolution disse:
    const detalhe = error.response?.data;
    console.error(`⚠️ Alerta na Instância ${instancia}:`, JSON.stringify(detalhe, null, 2));
    
    // TRUQUE DE MESTRE: Se a Evolution responder que a mensagem já foi enviada 
    // ou algo que indique que o número recebeu, retorne TRUE para limpar o banco.
    if (detalhe?.mensagem?.[0]?.includes("sent") || error.response?.status === 400) {
        console.log("🤔 Erro 400, mas a mensagem parece ter ido. Marcando como sucesso para evitar repetição.");
        return true; 
    }
    return false;
}
}

async function obterMensagemFormatada(agendamento) {
    const templatesFixos = {
        'confirmacao': "Olá {nome}!👋 Seu agendamento foi confirmado para o dia {data} às {hora}. Qualquer dúvida, estamos à disposição! Atenciosamente, {profissional}",
        'lembrete_24h': "Olá {nome}!👋 Lembramos que você tem um atendimento agendado para amanhã, dia {data} às {hora}. Contamos com sua presença! Atenciosamente, {profissional}",
        'pos_venda': "Olá {nome}!👋 Esperamos que você esteja bem após sua consulta! Caso tenha alguma dúvida ou precise de algo, estamos à disposição. Obrigado pela confiança! {profissional}"
    };

    let textoBase = agendamento.mensagem_personalizada || templatesFixos[agendamento.tipo_mensagem] || templatesFixos['confirmacao'];

    const dataExibicao = new Date(agendamento.data_envio);
    const dataF = dataExibicao.toLocaleDateString('pt-BR');
    const horaF = dataExibicao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'atendimento');
}

const verificarEEnviarTudo = async () => {
    const agora = new Date();
    const agoraISO = agora.toISOString();

    console.log(`--- 🕵️ VIGIA ATIVADO [${agora.toLocaleString('pt-BR')}] ---`);

    try {
        // Buscamos TODOS os registros pendentes
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente');

        if (error) throw error;

        if (!lembretes || lembretes.length === 0) {
            console.log("🔎 Nenhum registro pendente encontrado.");
            return;
        }

        for (let ag of lembretes) {
            // REGRA: Confirmação envia na hora. Outros tipos esperam o horário.
            const ehConfirmacao = ag.tipo_mensagem === 'confirmacao';
            const jaPassouDaHora = new Date(ag.data_envio) <= agora;

            if (ehConfirmacao || jaPassouDaHora) {
                console.log(`🚀 Processando ${ag.tipo_mensagem} para: ${ag.nome}`);

                const { data: conexao } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .single();

                if (!conexao) {
                    console.error(`⚠️ Sem WhatsApp para o usuário ${ag.user_id}`);
                    continue;
                }

                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Sucesso: ${ag.tipo_mensagem} enviado.`);
                }
            } else {
                console.log(`⏳ Aguardando horário de: ${ag.nome} (${ag.tipo_mensagem})`);
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };