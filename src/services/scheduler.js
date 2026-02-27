const supabase = require('../config/db');
const axios = require('axios');

// --- ENVIO DINÂMICO PARA EVOLUTION API ---
async function enviarMensagemDinamica(numero, texto, instancia, apikey) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const baseUrl = process.env.EVOLUTION_URL || "https://api.formulape.app.br"; // Backup caso a env falhe
        
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
        console.error(`❌ Erro na Evolution (${instancia}):`, error.response?.data || error.message);
        // Se der erro de "já enviado" ou algo do tipo, marcamos como sucesso para não travar o loop
        if (error.response?.status === 400 || error.response?.status === 409) return true;
        return false;
    }
}

async function obterMensagemFormatada(agendamento) {
    const templatesFixos = {
        'confirmacao': "Olá {nome}!👋 Seu agendamento foi confirmado para o dia {data} às {hora}. Atenciosamente, {profissional}",
        'lembrete_24h': "Olá {nome}!👋 Lembramos que você tem um atendimento agendado para amanhã, dia {data} às {hora}. Atenciosamente, {profissional}",
        'pos_venda': "Olá {nome}!👋 Esperamos que você esteja bem após sua consulta! Atenciosamente, {profissional}"
    };

    let textoBase = agendamento.mensagem_personalizada || templatesFixos[agendamento.tipo_mensagem] || templatesFixos['confirmacao'];

    const dataExibicao = new Date(agendamento.data_envio);
    const dataF = dataExibicao.toLocaleDateString('pt-BR');
    const horaF = dataExibicao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'atendimento')
        .replace(/{profissional}|{Profissão}/g, agendamento.profissional || 'Equipe FormulaPé');
}

const verificarEEnviarTudo = async () => {
    const agora = new Date();
    console.log(`--- 🕵️ VIGIA ATIVADO [${agora.toLocaleString('pt-BR')}] ---`);

    try {
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente');

        if (error) {
            console.error("❌ Erro ao buscar lembretes:", error.message);
            throw error;
        }

        if (!lembretes || lembretes.length === 0) {
            console.log("📭 Nenhum agendamento pendente.");
            return;
        }

        for (let ag of lembretes) {
            // Se for confirmação, envia na hora. Se não, verifica se já chegou o horário.
            const ehConfirmacao = ag.tipo_mensagem === 'confirmacao';
            const jaPassouDaHora = new Date(ag.data_envio) <= agora;

            if (ehConfirmacao || jaPassouDaHora) {
                console.log(`🔎 Processando: ${ag.nome} (${ag.tipo_mensagem})`);

                // BUSCA A INSTÂNCIA DINÂMICA NO BANCO
                const { data: conexao, error: connError } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .maybeSingle(); // Usamos maybeSingle para não quebrar se não achar

                if (connError || !conexao) {
                    console.error(`⚠️ Instância não encontrada para o user_id: ${ag.user_id}`);
                    continue;
                }

                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Mensagem enviada e status atualizado: ${ag.nome}`);
                } else {
                    console.log(`⏳ Falha no envio, tentará novamente no próximo ciclo: ${ag.nome}`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro Crítico no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };