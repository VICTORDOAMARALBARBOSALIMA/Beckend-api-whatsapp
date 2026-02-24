const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

async function enviarMensagemAPI(numero, texto) {
    // 1. Limpa TUDO que não for número primeiro (tira +, espaços, parênteses)
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    
    // 2. Monta o JID padrão WhatsApp
    const jid = `${numeroLimpo}@s.whatsapp.net`;
    
    console.log(`🚀 Preparando envio para: ${jid}`);

    // ... restante do seu código de fetch (POST para a Evolution API)

    try {
        // Ajustado para o padrão que sua instância exige: textMessage
        await axios.post(`${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`, {
            number: jid,
            textMessage: {
                text: texto
            }
        }, { headers: whatsappConfig.headers });
        
        return true;
    } catch (error) {
        console.error(`❌ Erro Evolution API (${jid}):`, 
            JSON.stringify(error.response?.data || error.message, null, 2)
        );
        return false;
    }
}

// <<< AQUI ESTÁ O AJUSTE DA FORMATAÇÃO >>>
function formatarMensagem(agendamento) {
    // CORREÇÃO: Alterado de data_hora para data_envio
    const dataObj = new Date(agendamento.data_envio);
    
    // Validação para garantir que a data é um objeto válido
    const dataFormatada = !isNaN(dataObj) 
        ? dataObj.toLocaleDateString('pt-BR') 
        : "Data pendente";
        
    const horaFormatada = !isNaN(dataObj) 
        ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
        : "Horário pendente";
    
    // Usando os nomes de colunas que vimos nas fotos do seu Supabase
    const nome = agendamento.paciente_nom || agendamento.paciente_nome || 'Cliente';
    const servico = agendamento.servico || 'atendimento';

    return `Olá ${nome}! 
Passando para confirmar seu horário de agendamento.
🗓️ Data: ${dataFormatada}
⏰ Hora: ${horaFormatada}
Podemos confirmar?`;
}

const verificarEEnviarTudo = async () => {
    console.log("--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO (Tabela: lembretes_final) ---");
    const agora = new Date();

    try {
        // BUSCA: Agora usando os nomes corretos (status e data_envio)
        // Removido o .gt para pegar também o que está atrasado
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente') 
            .lte('data_envio', agora.toISOString()); // Pega tudo de AGORA para TRÁS

        if (error) {
            console.error("❌ Erro ao buscar:", error.message);
            return;
        }

        if (lembretes && lembretes.length > 0) {
            console.log(`📦 Encontrados ${lembretes.length} lembretes para processar.`);
            
            for (let ag of lembretes) {
                const msg = formatarMensagem(ag);
                
                // CORREÇÃO: Usando ag.telefone que é o nome novo da coluna
                const numeroParaEnvio = ag.telefone; 
                
                const enviado = await enviarMensagemAPI(numeroParaEnvio, msg);
                
                if (enviado) {
                    // CORREÇÃO: Atualizando a coluna 'status' (não status_lembrete)
                    await supabase
                        .from('lembretes_final')
                        .update({ status: 'enviado' })
                        .eq('id', ag.id);
                    console.log(`✅ Lembrete enviado para o número: ${numeroParaEnvio}`);
                }
            }
        } else {
            console.log("📌 Nenhum lembrete pendente encontrado para o horário atual.");
        }
    } catch (err) {
        console.error("🔥 Erro inesperado no Vigia:", err);
    }
};

module.exports = { verificarEEnviarTudo };