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
    // 1. Definição do Fallback (Caso não exista template no banco)
    const templatesPadrao = {
        'confirmacao': "Olá {nome}!👋 Seu agendamento foi confirmado para o dia {data} às {hora}. Atenciosamente, {profissional}",
        'lembrete_24h': "Olá {nome}!👋 Lembramos que você tem um atendimento agendado para amanhã, dia {data} às {hora}. Atenciosamente, {profissional}",
        'Pos-Atendimento': "Olá {nome}!👋 Esperamos que você esteja bem após sua consulta! Atenciosamente, {profissional}"
    };

    let textoBase = null;

    try {
        // 2. BUSCA DINÂMICA NA TABELA 'templates'
        const { data: templateBanco } = await supabase
            .from('templates')
            .select('content')
            .eq('user_id', agendamento.user_id)
            .eq('slug', agendamento.tipo_mensagem)
            .maybeSingle();

        // 3. PRIORIDADE: Banco > Mensagem Personalizada do Agendamento > Padrão Fixo
        textoBase = templateBanco?.content || agendamento.mensagem_personalizada || templatesPadrao[agendamento.tipo_mensagem] || templatesPadrao['confirmacao'];

    } catch (error) {
        console.error("⚠️ Erro ao buscar template no banco, usando padrão.", error.message);
        textoBase = templatesPadrao[agendamento.tipo_mensagem] || templatesPadrao['confirmacao'];
    }

    // 4. FORMATAÇÃO DE DATA E HORA
    const dataExibicao = new Date(agendamento.data_envio);
    const dataF = dataExibicao.toLocaleDateString('pt-BR');
    const horaF = dataExibicao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // 5. REPLACE DAS VARIÁVEIS (Suporta tanto {nome} quanto {{nome}})
    return textoBase
        .replace(/{nome}|{{nome}}/g, agendamento.nome || 'Cliente')
        .replace(/{data}|{{data}}/g, dataF)
        .replace(/{hora}|{{hora}}/g, horaF)
        .replace(/{servico}|{{servico}}/g, agendamento.servico || 'atendimento')
        .replace(/{profissional}|{{profissional}}|{Profissão}/g, agendamento.profissional || 'Equipe FormulaPé');
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
                
             // --- NOVA TRAVA DE SEGURANÇA: VERIFICAÇÃO DE EXCLUSÃO ---
if (ag.agendamento_id) {
    // 1. IGNORA CANCELAMENTO SE FOR TESTE MANUAL
    if (String(ag.agendamento_id).startsWith('TESTE_')) {
        console.log(`🧪 ID de Teste detectado (${ag.agendamento_id}). Ignorando verificação.`);
    } else {
        // 2. VERIFICA NA TABELA REAL (Substitua 'agenda' pelo nome real da sua tabela de atendimentos)
        const { data: existeAgendamento } = await supabase
            .from('lembretes_final') 
            .select('id')
            .eq('agendamento_id', ag.agendamento_id) // <--- BUSCAR PELA COLUNA agendamento_id
            .maybeSingle();

        if (!existeAgendamento) {
            console.log(`🚫 Agendamento ${ag.agendamento_id} não encontrado. Cancelando TODOS os lembretes deste ID.`);
            
            // Cancela o lembrete atual, o de 24h e o de Pós-Atendimento de uma vez
            await supabase
                .from('lembretes_final')
                .update({ status: 'cancelado' })
                .eq('agendamento_id', ag.agendamento_id)
                .eq('status', 'pendente');
                
            continue; 
        }
    }
}
                // --- FIM DA TRAVA ---

                const { data: conexao } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .maybeSingle();

                if (!conexao) continue;

                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ Enviada: ${ag.nome}`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };