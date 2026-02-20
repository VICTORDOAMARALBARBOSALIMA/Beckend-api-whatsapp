const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer'); // 1. IMPORTAÇÃO ADICIONADA

let ultimoQR = "";

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // 2. O PULO DO GATO: Faz o código achar o Chrome no cache do Render
        executablePath: puppeteer.executablePath(), 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ]
    }
});

// Eventos do Cliente
client.on('qr', (qr) => {
    ultimoQR = qr; 
    console.log('⚠️ Novo QR Code gerado! Escaneie em /qrcode');
});

client.on('ready', () => {
    ultimoQR = ""; 
    console.log('🚀 WhatsApp pronto para uso!');
});

client.on('authenticated', () => console.log('✅ Autenticado com sucesso!'));

client.initialize();

module.exports = { 
    client, 
    getQR: () => ultimoQR 
};