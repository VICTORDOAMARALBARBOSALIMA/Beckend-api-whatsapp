const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Importações
const whatsappConfig = require('./src/config/whatsapp'); 
const { verificarEEnviarTudo } = require('./src/services/scheduler');
const supabase = require('./src/config/db');

// --- ROTA DE WEBHOOK ---
app.post('/webhook', (req, res) => {
    if (req.body.event === "messages.upsert") {
        console.log("📩 Nova mensagem detectada via Evolution API.");
    }
    res.status(200).send("OK"); 
});

// --- ROTA DE SALVAR AGENDAMENTO (CORRIGIDA) ---
// --- ROTA DE SALVAR AGENDAMENTO (VERSÃO BLINDADA) ---
app.post('/agendar', async (req, res) => {
    console.log("📝 Recebendo novo agendamento do Mocha...");
    const dados = req.body;
    const agora = new Date();
    const dataEnvioRecebida = new Date(dados.data_envio);

    // TRAVA DE SEGURANÇA: Se a data de envio já passou, nasce cancelado
    let statusInicial = 'pendente';
    if (dataEnvioRecebida < agora) {
        console.warn(`⚠️ Data de envio (${dados.data_envio}) está no passado. Marcando como cancelado.`);
        statusInicial = 'cancelado';
    }

    try {
        const { data, error } = await supabase
            .from('lembretes_final')
            .insert([{
                agendamento_id: dados.agendamento_id,
                telefone: dados.telefone,
                data_envio: dados.data_envio,
                servico: dados.servico,
                tipo_mensagem: dados.tipo_mensagem,
                user_id: dados.user_id,
                profissional: dados.profissional,
                nome: dados.nome, // Certifique-se que o Mocha envia o nome
                status: statusInicial // <--- Agora ele usa a nossa trava!
            }])
            .select();

        if (error) throw error;

        console.log(`✅ Agendamento salvo! ID: ${dados.agendamento_id} | Status: ${statusInicial}`);
        res.status(201).json({ mensagem: "Agendamento processado!", status: statusInicial });
    } catch (err) {
        console.error("❌ Erro ao salvar agendamento:", err.message);
        res.status(500).json({ erro: "Erro ao salvar no banco", detalhe: err.message });
    }
});

// --- ROTA DE STATUS (CORRIGIDA PARA NÃO DAR ERRO) ---
app.get('/status', (req, res) => {
    res.json({ 
        status: "Servidor FormulaPé Online", 
        modo: "Multi-Instância Ativo",
        supabase: "Conectado",
        timestamp: new Date().toLocaleString('pt-BR')
    });
});

// --- ROTA DE DISPARO MANUAL ---
app.post(['/enviar-agora', '/send-manual'], async (req, res) => {
    console.log("🚨 REQUISIÇÃO MANUAL RECEBIDA!");
    const { agendamentoId } = req.body;

    if (!agendamentoId) return res.status(400).json({ erro: "ID não fornecido" });

    try {
        await supabase
            .from('lembretes_final')
            .update({ status: 'pendente', data_envio: new Date().toISOString() })
            .eq('id', agendamentoId);

        await verificarEEnviarTudo();
        res.json({ mensagem: "Processamento disparado!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// --- VIGIA AUTOMÁTICO ---
console.log("📢 Iniciando vigia de agendamentos...");
setInterval(() => {
    verificarEEnviarTudo();
}, 60 * 1000); 

// Rota de saúde para o Mocha parar de dar 404
app.get('/', (req, res) => {
    res.status(200).json({ status: "online", message: "Robô operando normalmente" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});

// Função Utilitária para formatar mensagens (Placeholders)
function formatarMensagemCustomizada(template, dados) {
    if (!template) return null;
    return template
        .replace(/{{nome}}/g, dados.nome_cliente || "Cliente")
        .replace(/{{data}}/g, dados.data_agendamento || "")
        .replace(/{{servico}}/g, dados.servico || "procedimento")
        .replace(/{{profissional}}/g, dados.profissional || "");
}