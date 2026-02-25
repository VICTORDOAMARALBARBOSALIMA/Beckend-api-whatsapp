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
        const url = `${urlBaseLimpa}/message/sendText/${encodeURIComponent(instancia)}`;        
        
        const payload = {
            number: numeroLimpo,
            textMessage: { text: texto },
            options: { delay: 1200, presence: "composing", linkPreview: false }
        };

        await axios.post(url, payload, { 
            headers: { "apikey": apikey, "Content-Type": "application/json" } 
        });
        return true;

    } catch (error) {
        const detalhe = error.response?.data;
        if (detalhe?.mensagem?.[0]?.includes("sent") || error.response?.status === 400) {
            return true; 
        }
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

    // Aqui usamos o campo 'profissional' que deve vir da tabela 'lembretes_final'
    // Se o Mocha salvar o nome lá, ele aparece aqui.
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

        if (error) throw error;
        if (!lembretes || lembretes.length === 0) return;

        for (let ag of lembretes) {
            const ehConfirmacao = ag.tipo_mensagem === 'confirmacao';
            const jaPassouDaHora = new Date(ag.data_envio) <= agora;

            if (ehConfirmacao || jaPassouDaHora) {
                const { data: conexao } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .single();

                if (!conexao) continue;

                // Passamos apenas o 'ag' porque agora esperamos que o nome do profissional 
                // esteja na própria tabela 'lembretes_final'
                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Sucesso: ${ag.nome}`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };