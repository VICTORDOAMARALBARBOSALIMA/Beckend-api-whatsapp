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
        console.error(`❌ Erro Evolution API (${numero}):`, error.response?.data || error.message);
        return false;
    }
}

// <<< AQUI ESTÁ O AJUSTE DA FORMATAÇÃO >>>
function formatarMensagem(agendamento) {
    const dataObj = new Date(agendamento.data_hora);
    const dataFormatada = dataObj.toLocaleDateString('pt-BR');
    const horaFormatada = dataObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Usando agendamento.servico (tudo minúsculo, sem acento)
    return `Olá ${agendamento.paciente_nome}! 
Passando para confirmar seu horário de ${agendamento.servico || 'atendimento'} na FormulaPé.
🗓️ Data: ${dataFormatada}
⏰ Hora: ${horaFormatada}
Podemos confirmar?`;
}

const verificarEEnviarTudo = async () => {
    console.log("--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO (Tabela: lembretes_final) ---");
    const agora = new Date();
    const limiteAmanha = new Date(agora.getTime() + (24 * 60 * 60 * 1000)); 

    try {
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status_lembrete', 'pendente') 
            .lte('data_hora', limiteAmanha.toISOString()) 
            .gt('data_hora', agora.toISOString());        

        if (error) {
            console.error("❌ Erro ao buscar:", error.message);
            return;
        }

        if (lembretes && lembretes.length > 0) {
            for (let ag of lembretes) {
                const msg = formatarMensagem(ag);
                // Usando ag.whatsapp (tudo minúsculo)
                const enviado = await enviarMensagemAPI(ag.whatsapp, msg);
                
                if (enviado) {
                    await supabase
                        .from('lembretes_final')
                        .update({ status_lembrete: 'enviado' })
                        .eq('id', ag.id);
                    console.log(`✅ Lembrete enviado para: ${ag.paciente_nome}`);
                }
            }
        } else {
            console.log("📌 Nenhum lembrete pendente encontrado em lembretes_final.");
        }

    } catch (err) {
        console.error("❌ Erro crítico no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };