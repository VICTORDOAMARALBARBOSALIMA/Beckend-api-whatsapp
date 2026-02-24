const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

// --- ENVIO PARA EVOLUTION API ---
async function enviarMensagemAPI(numero, texto) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const url = `${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`;
        
        const payload = {
            number: numeroLimpo,
            options: { delay: 1200, presence: "composing", linkPreview: false },
            textMessage: { text: texto }
        };

        await axios.post(url, payload, { headers: whatsappConfig.headers });
        return true;
    } catch (error) {
        console.error(`❌ Erro Evolution API (${numeroLimpo}):`, error.response?.data || error.message);
        return false;
    }
}

// --- FORMATAÇÃO DE MENSAGEM (SEM CONSULTA AO BANCO) ---
async function obterMensagemFormatada(agendamento) {
    // Se você escreveu algo personalizado para esse agendamento específico, ele ainda respeita.
    if (agendamento.mensagem_personalizada) {
        return agendamento.mensagem_personalizada; 
    }

    // Textos Padrão (Fixos para evitar erro de banco)
    const templatesFixos = {
        'confirmacao': "Olá {nome}! Confirmamos seu horário de {servico} para o dia {data} às {hora}. Podemos confirmar?",
        'lembrete_24h': "Olá {nome}! Passando para lembrar do seu atendimento de {servico} amanhã, dia {data} às {hora}. Até lá!",
        'pos_venda': "Olá {nome}! ✨ Esperamos que tenha gostado do seu atendimento hoje. Como você está se sentindo?"
    };

    // Define qual texto usar baseado no tipo_mensagem vindo do Mocha
    let textoBase = templatesFixos[agendamento.tipo_mensagem] || templatesFixos['confirmacao'];

    const dataObj = new Date(agendamento.data_envio);
    const dataF = !isNaN(dataObj) ? dataObj.toLocaleDateString('pt-BR') : "";
    const horaF = !isNaN(dataObj) ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "";

    // Faz as trocas das variáveis {nome}, {data}, etc.
    return textoBase
        .replace(/{nome}/g, agendamento.nome || 'Cliente')
        .replace(/{data}/g, dataF)
        .replace(/{hora}/g, horaF)
        .replace(/{servico}/g, agendamento.servico || 'procedimento');
}

// --- O VIGIA (SCHEDULER) ---
const verificarEEnviarTudo = async () => {
    const agora = new Date();
    console.log(`--- 🕵️ VIGIA FORMULAPÉ [SIMPLIFICADO] [${agora.toLocaleString()}] ---`);

    try {
        // Pega tudo que é 'pendente' e cuja data de envio já passou ou é AGORA
        // Usamos uma margem de segurança para garantir que o fuso não trave o envio
       const { data: lembretes, error } = await supabase
    .from('lembretes_final') 
    .select('*')
    .eq('status', 'pendente') 
    // Comparamos com a hora atual + 3 horas de margem para compensar o fuso
    .filter('data_envio', 'lte', new Date(new Date().getTime() + 3 * 60 * 60 * 1000).toISOString());
        if (error) throw error;

        if (lembretes && lembretes.length > 0) {
            console.log(`📦 Encontrados ${lembretes.length} lembretes para enviar.`);
            
            for (let ag of lembretes) {
                const msg = await obterMensagemFormatada(ag);
                const enviado = await enviarMensagemAPI(ag.telefone, msg);
                
                if (enviado) {
                    await supabase
                        .from('lembretes_final')
                        .update({ status: 'enviado' })
                        .eq('id', ag.id);
                    console.log(`✅ Mensagem enviada para: ${ag.nome}`);
                }
            }
        } else {
            console.log("📌 Nada pendente para este minuto.");
        }
    } catch (err) {
        console.error("🔥 Erro crítico no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };