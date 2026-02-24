const express = require('express');
require('dotenv').config();

const whatsappConfig = require('./src/config/whatsapp'); 
const { verificarEEnviarTudo } = require('./src/services/scheduler');
const supabase = require('./src/config/db');

const app = express();
app.use(express.json());

// --- ROTA DE WEBHOOK (Ouvido da Evolution API) ---
app.post('/webhook', (req, res) => {
    if (req.body.event === "messages.upsert") {
        console.log("📩 Nova mensagem detectada via Evolution API.");
    }
    res.status(200).send("OK"); 
});

// --- ROTA DE ENVIO MANUAL ---
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

// --- ROTA DE STATUS ---
app.get('/status', (req, res) => {
    res.json({ 
        status: "Servidor FormulaPé Online", 
        instance: whatsappConfig.instance,
        timestamp: new Date().toLocaleString('pt-BR')
    });
});

// --- VIGIA AUTOMÁTICO (Intervalo de 1 minuto) ---
console.log("📢 Iniciando vigia de agendamentos...");

// Primeira execução imediata ao subir o servidor
verificarEEnviarTudo(); 

// Loop de 1 em 1 minuto
setInterval(() => {
    verificarEEnviarTudo();
}, 60 * 1000); 

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});