const supabase = require('../config/db');
const axios = require('axios');

// --- ENVIO DINÂMICO PARA EVOLUTION API ---
async function enviarMensagemDinamica(numero, texto, instancia, apikey) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        // A URL agora é montada usando a instância específica do dono do agendamento
        const baseUrl = process.env.EVOLUTION_BASE_URL; 
        const url = `${baseUrl}/message/sendText/${instancia}`;
        
        const payload = {
            number: numeroLimpo,
            options: { delay: 1200, presence: "composing", linkPreview: false },
            textMessage: { text: texto }
        };

        await axios.post(url, payload, { 
            headers: { "apikey": apikey, "Content-Type": "application/json" } 
        });
        return true;
    } catch (error) {
        console.error(`❌ Erro na Instância ${instancia} (${numeroLimpo}):`, error.response?.data || error.message);
        return false;
    }
}

async function obterMensagemFormatada(agendamento) {
    const templatesFixos = {
        'confirmacao': "Olá {nome}! Confirmamos seu horário de {servico} para o dia {data} às {hora}. Podemos confirmar?",
        'lembrete_24h': "Olá {nome}! Passando para lembrar do seu atendimento de {servico} amanhã, {data} às {hora}.",
        'pos_venda': "Olá {nome}! Como você está se sentindo após o atendimento de hoje?"
    };

    let textoBase = agendamento.mensagem_personalizada || templatesFixos[agendamento.tipo_mensagem] || templatesFixos['confirmacao'];

    const dataObj = new Date(agendamento.data_envio);
    const dataExibicao = new Date(dataObj.getTime() - 3 * 60 * 60 * 1000);
    
    const dataF = dataExibicao.toLocaleDateString('pt-BR');
    const horaF = dataExibicao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'atendimento');
}

const verificarEEnviarTudo = async () => {
    const agoraComFuso = new Date(new Date().getTime() + 3 * 60 * 60 * 1000);
    console.log(`--- 🕵️ VIGIA MULTI-INSTÂNCIA [${new Date().toLocaleString()}] ---`);

    try {
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente') 
            .lte('data_envio', agoraComFuso.toISOString()); 

        if (error) throw error;

        if (lembretes && lembretes.length > 0) {
            for (let ag of lembretes) {
                // BUSCA A INSTÂNCIA DO USUÁRIO NO BANCO
                const { data: conexao } = await supabase
                    .from('usuarios_whatsapp')
                    .select('instance_name, apikey')
                    .eq('user_id', ag.user_id)
                    .single();

                if (!conexao) {
                    console.error(`⚠️ Usuário ${ag.user_id} sem WhatsApp conectado.`);
                    continue;
                }

                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemDinamica(ag.telefone, msg, conexao.instance_name, conexao.apikey);
                
                if (enviado) {
                    await supabase.from('lembretes_final').update({ status: 'enviado' }).eq('id', ag.id);
                    console.log(`✅ [${conexao.instance_name}] Mensagem enviada para: ${ag.nome}`);
                }
            }
        }
    } catch (err) {
        console.error("🔥 Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };