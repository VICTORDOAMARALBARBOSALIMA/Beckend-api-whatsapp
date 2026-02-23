const express = require('express');
require('dotenv').config();

// Importações dos novos arquivos de config e serviços
const whatsappConfig = require('./src/config/whatsapp'); 
const { verificarEEnviarTudo } = require('./src/services/scheduler');
const supabase = require('./src/config/db');

const app = express();
app.use(express.json());

// --- ROTA DE WEBHOOK (Ouvido da Evolution API) ---
// É aqui que a Evolution API vai bater quando chegar mensagem
app.post('/webhook', async (req, res) => {
    const data = req.body;
    
    // Log para você ver as mensagens chegando no console do Render
    if (data.event === "messages.upsert") {
        console.log("📩 Nova mensagem recebida via Evolution API!");
    }

    res.status(200).send("OK"); 
});

// --- ROTA DE ENVIO MANUAL (Agora via API) ---
app.get('/enviar', async (req, res) => {
    const { numero, mensagem } = req.query;
    if (!numero || !mensagem) return res.status(400).send("Faltou dados!");

    try {
        const axios = require('axios');
        const formattedNumber = numero.replace(/\D/g, '');
        
        await axios.post(`${whatsappConfig.baseUrl}/message/sendText/${whatsappConfig.instance}`, {
            number: formattedNumber,
            text: mensagem
        }, { headers: whatsappConfig.headers });

        res.send(`✅ Enviada via Evolution para ${numero}!`);
    } catch (error) {
        console.error("Erro ao enviar:", error.response?.data || error.message);
        res.status(500).send("❌ Erro ao enviar via API.");
    }
});

// --- ROTA DE ATUALIZAÇÃO DE TEMPLATES (Mantida do Supabase) ---
app.post('/templates/update', async (req, res) => {
    const { slug, novoConteudo } = req.body;
    if(!slug || !novoConteudo) return res.status(400).json({ error: "Faltam dados." });

    const { error } = await supabase
        .from('templates')
        .update({ conteudo: novoConteudo })
        .eq('slug', slug);

    if (error) return res.status(500).json(error);
    res.json({ message: "Texto atualizado com sucesso!" });
});

app.get('/status', (req, res) => {
    res.json({ 
        status: "Servidor FormulaPé Online",
        engine: "Evolution API",
        instance: whatsappConfig.instance
    });
});

// --- VIGIA AUTOMÁTICO (Mantido - O coração do seu negócio) ---
// Agora ele não precisa esperar o "ready", ele começa assim que o servidor sobe
console.log("📢 Iniciando vigia de agendamentos...");
verificarEEnviarTudo(); 

setInterval(() => {
    console.log("⏰ 30 minutos se passaram. Rodando vigia automático...");
    verificarEEnviarTudo();
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Cérebro rodando na porta ${PORT}`);
}); 