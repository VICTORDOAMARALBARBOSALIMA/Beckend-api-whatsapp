const supabase = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const axios = require('axios');

// --- ENVIO PARA EVOLUTION API ---
async function enviarMensagemAPI(numero, texto) {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    try {
        const url = `${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`;
        await axios.post(url, {
            number: numeroLimpo,
            text: texto
        }, { headers: whatsappConfig.headers });
        return true;
    } catch (error) {
        console.error(`❌ Erro Evolution API (${numeroLimpo}):`, error.response?.data || error.message);
        return false;
    }
}

async function obterMensagemFormatada(agendamento) {
    // 1. PRIORIDADE: Mensagem personalizada escrita no agendamento
    if (agendamento.mensagem_personalizada) {
        console.log(`📝 Usando mensagem personalizada para: ${agendamento.nome}`);
        return agendamento.mensagem_personalizada; 
    }

    // 2. SEGUNDA OPÇÃO: Busca o template padrão
    try {
        const { data: template } = await supabase
            .from('templates')
            .select('conteudo')
            .eq('slug', agendamento.tipo_mensagem || 'confirmacao')
            .single();

        let textoBase = template?.conteudo || "Olá {{nome}}, confirmamos seu horário de {{servico}} para {{data}} às {{hora}}.";

        const dataObj = new Date(agendamento.data_envio);
        const dataF = !isNaN(dataObj) ? dataObj.toLocaleDateString('pt-BR') : "pendente";
        // CORREÇÃO AQUI: Adicionado o fallback para evitar o erro de sintaxe
        const horaF = !isNaN(dataObj) ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "pendente";

        // 3. Formata o template
        return textoBase
            .replace(/{{nome}}/g, agendamento.nome || 'Cliente')
            .replace(/{{servico}}/g, agendamento.servico || 'atendimento')
            .replace(/{{data}}/g, dataF)
            .replace(/{{hora}}/g, horaF);
            
    } catch (err) {
        return `Olá ${agendamento.nome || 'Cliente'}, confirmamos seu atendimento.`;
    }
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