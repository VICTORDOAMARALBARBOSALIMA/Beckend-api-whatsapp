const supabase = require('../config/db');
const axios = require('axios');

// --- ENVIO DINÂMICO PARA EVOLUTION API ---
async function enviarMensagemDinamica(numero, texto, instancia, apikey) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const baseUrl = process.env.EVOLUTION_URL || "https://api.formulape.app.br"; 
        
        const urlBaseLimpa = baseUrl.replace(/\/$/, ""); 
        const url = `${urlBaseLimpa}/message/sendText/${encodeURIComponent(instancia)}`;        
        
        const payload = {
            number: numeroLimpo,
            textMessage: { text: texto },
            options: { delay: 1200, presence: "composing", linkPreview: false }
        };

        console.log(`📡 Tentando enviar via Evolution: ${instancia}`);

        await axios.post(url, payload, { 
            headers: { "apikey": apikey, "Content-Type": "application/json" } 
        });
        return true;

   } catch (error) {
        // Pega a mensagem de erro real da Evolution
        const erroReal = error.response?.data?.message || error.response?.data?.error || error.message;
        console.error(`❌ Erro na Evolution (${instancia}):`, erroReal);

        // Se o erro for "Nenhuma sessão", "Instância não encontrada" ou 404
        // NÃO retornamos true. Retornamos false para ele continuar 'pendente'.
        if (JSON.stringify(erroReal).includes('SessionError') || error.response?.status === 404) {
            console.warn("⚠️ A instância no banco não bate com a instância na API. Verifique o nome!");
            return false; 
        }

        // Apenas em erros de conflito (409) ou dados inválidos (400) que não sejam de sessão
        // marcamos como true para não travar o robô em números inexistentes.
        if (error.response?.status === 409) return true;

        return false;
    }
}

// --- FORMATAÇÃO DE MENSAGENS ---
async function obterMensagemFormatada(agendamento) {
    const templatesPadrao = {
        'confirmacao': "Olá {nome}!👋 Seu agendamento foi confirmado para o dia {data} às {hora}. Atenciosamente, {profissional}",
        'lembrete_5h': "Olá {nome}!👋 Lembramos que você tem um atendimento agendado para hoje, dia {data} às {hora}. Atenciosamente, {profissional}",
        'Pos-Atendimento': "Olá {nome}!👋 Esperamos que você esteja bem após sua consulta! Atenciosamente, {profissional}"
    };

    let textoBase = null;

    try {
        const { data: templateBanco } = await supabase
            .from('templates')
            .select('content')
            .eq('user_id', agendamento.user_id)
            .eq('slug', agendamento.tipo_mensagem)
            .maybeSingle();

        textoBase = templateBanco?.content || agendamento.mensagem_personalizada || templatesPadrao[agendamento.tipo_mensagem] || templatesPadrao['confirmacao'];

    } catch (error) {
        console.error("⚠️ Erro ao buscar template no banco, usando padrão.", error.message);
        textoBase = templatesPadrao[agendamento.tipo_mensagem] || templatesPadrao['confirmacao'];
    }

    const dataExibicao = new Date(agendamento.data_atendimento || agendamento.data_envio);
    const dataF = dataExibicao.toLocaleDateString('pt-BR');
    const horaF = dataExibicao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return textoBase
        .replace(/{nome}|{{nome}}/g, agendamento.nome || 'Cliente')
        .replace(/{data}|{{data}}/g, dataF)
        .replace(/{hora}|{{hora}}/g, horaF)
        .replace(/{servico}|{{servico}}/g, agendamento.servico || 'atendimento')
        .replace(/{profissional}|{{profissional}}|{Profissão}/g, agendamento.profissional || 'Equipe FormulaPé');
}

// --- VIGIA E PROCESSAMENTO DE FILA ---
const verificarEEnviarTudo = async () => {
    const agora = new Date();
    console.log(`--- 🕵️ VIGIA ATIVADO [${agora.toLocaleString('pt-BR')}] ---`);

    try {
        // Busca apenas o que está pendente (A fila oficial)
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente');

        if (error) throw error;
        if (!lembretes || lembretes.length === 0) return;

        for (let ag of lembretes) {
            const ehConfirmacao = ag.tipo_mensagem === 'confirmacao';
            const jaPassouDaHora = new Date(ag.data_envio) <= agora;

            // Se for Confirmação imediata ou se a hora agendada já chegou/passou
            if (ehConfirmacao || jaPassouDaHora) {
                
                // 1. Pega os dados de conexão do usuário no WhatsApp
                const { data: conexao } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .maybeSingle();

                if (!conexao) continue;

                // 2. Formata e Envia
                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                // 3. Atualiza o status se deu certo
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Enviada: ${ag.nome} (${ag.tipo_mensagem})`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };