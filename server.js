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

// --- NOVA ROTA: SALVAR AGENDAMENTO (O que o Mocha precisa!) ---
app.post('/agendar', async (req, res) => {
    console.log("📝 Recebendo novo agendamento do Mocha...");
    const dados = req.body;

    try {
        const { data, error } = await supabase
            .from('lembretes_final')
            .insert([{
                telefone: dados.telefone,
                data_envio: dados.data_envio,
                servico: dados.servico,
                tipo_mensagem: dados.tipo_mensagem,
                user_id: dados.user_id,
                profissional: dados.profissional,
                status: 'pendente'
            }])
            .select();

        if (error) throw error;

        console.log("✅ Agendamento salvo no Supabase com sucesso!");
        res.status(201).json({ mensagem: "Agendamento salvo!", data });
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