const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

// --- ENVIO PARA EVOLUTION API ---
async function enviarMensagemAPI(numero, texto) {
    // 1. Limpa o número para garantir que só tenha dígitos
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    
    try {
        const url = `${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`;
        
        // 2. Montando o payload no formato que evita o Erro 400
        const payload = {
            number: numeroLimpo,
            options: {
                delay: 1200,
                presence: "composing",
                linkPreview: false
            },
            textMessage: {
                text: texto
            }
        };

        console.log(`🚀 Tentando envio para ${numeroLimpo}...`);

        const response = await axios.post(url, payload, { headers: whatsappConfig.headers });
        
        return response.status === 200 || response.status === 201;
    } catch (error) {
        // Log detalhado para sabermos exatamente o que a Evolution não gostou
        console.error(`❌ Erro detalhado Evolution (${numeroLimpo}):`, 
            JSON.stringify(error.response?.data || error.message, null, 2)
        );
        return false;
    }
}
async function obterMensagemFormatada(agendamento) {
    // 1. PRIORIDADE: Mensagem personalizada
    if (agendamento.mensagem_personalizada) {
        return agendamento.mensagem_personalizada; 
    }

    // 2. SEGUNDA OPÇÃO: Busca o template padrão usando os slugs novos
    // slugs esperados: 'confirmation', '24h_before', 'post_appointment'
    const slugBusca = agendamento.tipo_mensagem === 'confirmacao' ? 'confirmation' : agendamento.tipo_mensagem;

    const { data: template } = await supabase
        .from('templates')
        .select('conteudo')
        .eq('slug', slugBusca)
        .single();

    let textoBase = template?.conteudo || "Olá {nome}, confirmamos seu horário dia {data} às {hora}.";

    const dataObj = new Date(agendamento.data_envio);
    const dataF = !isNaN(dataObj) ? dataObj.toLocaleDateString('pt-BR') : "";
    const horaF = !isNaN(dataObj) ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "";

    // 3. Formata usando {variavel} conforme sua lista
    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'atendimento')
        // Caso queira adicionar as novas variáveis que o Mocha enviará no futuro:
        .replace(/{profissional}/g, agendamento.profissional || 'Equipe FormulaPé')
        .replace(/{link_agendamento}/g, 'https://formulape.com.br'); 
}

// --- O VIGIA (SCHEDULER) ---
const verificarEEnviarTudo = async () => {
    const agora = new Date();
    console.log(`--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO [${agora.toLocaleString()}] ---`);

    try {
        const { data: lembretes, error } = await supabase
            .from('lembretes_final') 
            .select('*')
            .eq('status', 'pendente') 
            .lte('data_envio', agora.toISOString()); 

        if (error) {
            console.error("❌ Erro ao buscar no Supabase:", error.message);
            return;
        }

        if (lembretes && lembretes.length > 0) {
            console.log(`📦 Encontrados ${lembretes.length} lembretes pendentes.`);
            
            for (let ag of lembretes) {
                // ATENÇÃO: Adicionado o 'await' aqui pois a função agora busca no banco
                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemAPI(ag.telefone, msg);
                
                if (enviado) {
                    await supabase
                        .from('lembretes_final')
                        .update({ status: 'enviado' })
                        .eq('id', ag.id);
                    console.log(`✅ Sucesso para: ${ag.nome} (${ag.telefone})`);
                }
            }
        } else {
            console.log("📌 Nada para enviar agora.");
        }
    } catch (err) {
        console.error("🔥 Erro crítico no Vigia:", err);
    }
};

module.exports = { verificarEEnviarTudo };