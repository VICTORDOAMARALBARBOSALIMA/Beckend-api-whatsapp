const express = require('express');
const cors = require('cors'); // Importado no lugar certo
require('dotenv').config();

const app = express(); // Primeiro criamos o app

// Agora configuramos o app
app.use(cors()); // Agora sim o cors funciona!
app.use(express.json());

// Importações de módulos do projeto (após inicializar o express)
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

// --- ROTA DE ENVIO MANUAL (VIA QUERY) ---
app.get('/enviar', async (req, res) => {
    const { numero, mensagem } = req.query;
    if (!numero || !mensagem) return res.status(400).send("Faltou numero ou mensagem!");

    try {
        const axios = require('axios');
        const cleanNumber = numero.replace(/\D/g, '');
        const url = `${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`;
        
        await axios.post(url, {
            number: cleanNumber,
            text: mensagem
        }, { headers: whatsappConfig.headers });

        res.send(`✅ Mensagem enviada com sucesso para ${cleanNumber}`);
    } catch (error) {
        console.error("❌ Erro no envio manual:", error.response?.data || error.message);
        res.status(500).json({ erro: "Erro no envio manual", detalhe: error.response?.data || error.message });
    }
});

// --- ATUALIZAÇÃO DE TEMPLATES ---
app.post('/templates/update', async (req, res) => {
    const { slug, novoConteudo } = req.body;
    
    if (!slug || !novoConteudo) {
        return res.status(400).json({ error: "Slug e novoConteudo são obrigatórios." });
    }

    const { error } = await supabase
        .from('templates')
        .update({ conteudo: novoConteudo })
        .eq('slug', slug);

    if (error) {
        console.error("❌ Erro ao atualizar template:", error.message);
        return res.status(500).json(error);
    }
    
    res.json({ message: `Template '${slug}' atualizado com sucesso!` });
});

// --- ROTA DE DISPARO MANUAL (CHAMADA PELO MOCHA) ---
app.post('/enviar-agora', async (req, res) => {
    console.log("-----------------------------------------");
    console.log("🚨 ALERTA: REQUISIÇÃO MANUAL RECEBIDA!");
    console.log("📦 CORPO RECEBIDO:", JSON.stringify(req.body));
    console.log("-----------------------------------------");

    const { agendamentoId } = req.body;

    if (!agendamentoId) {
        return res.status(400).json({ erro: "ID não fornecido no JSON" });
    }

    try {
        // Teste de busca antes do update
        const { data: registro } = await supabase
            .from('lembretes_final')
            .select('id, nome')
            .eq('id', agendamentoId)
            .single();

        if (!registro) {
            console.log("❌ ERRO: ID recebido não existe no banco:", agendamentoId);
            return res.status(404).json({ erro: "Agendamento não encontrado no banco" });
        }

        console.log(`✅ Registro encontrado: ${registro.nome}. Atualizando status...`);

        await supabase
            .from('lembretes_final')
            .update({ status: 'pendente', data_envio: new Date().toISOString() })
            .eq('id', agendamentoId);

        await verificarEEnviarTudo();
        res.json({ mensagem: "Sucesso!" });

    } catch (err) {
        console.error("🔥 Erro na rota manual:", err.message);
        res.status(500).json({ erro: err.message });
    }
});

// --- ROTA DE STATUS ---
app.get('/status', (req, res) => {
    res.json({ 
        status: "Servidor FormulaPé Online", 
        instance: whatsappConfig.instance,
        timestamp: new Date().toLocaleString('pt-BR')
    });
});

// --- VIGIA AUTOMÁTICO ---
console.log("📢 Iniciando vigia de agendamentos...");

// Primeira execução imediata
verificarEEnviarTudo(); 

// Loop de 1 em 1 minuto
setInterval(() => {
    verificarEEnviarTudo();
}, 60 * 1000); 

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});