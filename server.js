const express = require('express');
const qrcode = require('qrcode');
require('dotenv').config();

// 1. Importações corrigidas
const { client, getQR } = require('./src/config/whatsapp'); 
// Importando o nome novo que está no seu scheduler.js
const { verificarEEnviarTudo } = require('./src/services/scheduler');
const supabase = require('./src/config/db'); // Adicionei essa linha para a rota de update funcionar

const app = express();
app.use(express.json());

// --- GATILHO IMPORTANTE: Roda o Vigia assim que o WhatsApp logar ---
client.on('ready', () => {
    console.log("🚀 WhatsApp pronto para uso!");
    console.log("📢 Chamando o Vigia para a primeira varredura...");
    verificarEEnviarTudo(); // Chama a função na hora!
});

// Rota do QR Code
app.get('/qrcode', async (req, res) => {
    const code = getQR(); 
    if (!code) return res.send("Aguarde... gerando QR Code.");
    res.setHeader('Content-Type', 'image/png');
    qrcode.toFileStream(res, code); 
});

// Rota de Envio Manual
app.get('/enviar', async (req, res) => {
    const { numero, mensagem } = req.query;
    if (!numero || !mensagem) return res.status(400).send("Faltou dados!");
    try {
        const chatId = `${numero.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(chatId, mensagem);
        res.send(`✅ Enviada para ${numero}!`);
    } catch (error) {
        res.status(500).send("❌ Erro: " + error.message);
    }
});

// Rota para o seu APP atualizar os templates
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
    res.json({ status: "Servidor FormulaPé Online" });
});

// 3. Vigia automático a cada 30 minutos
setInterval(() => {
    console.log("⏰ 30 minutos se passaram. Rodando vigia automático...");
    verificarEEnviarTudo();
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});