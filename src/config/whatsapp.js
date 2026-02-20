const { Client, LocalAuth } = require('whatsapp-web.js');

// Variável para armazenar o QR Code
let ultimoQR = "";

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // REMOVEMOS a linha do executablePath: '/usr/bin/google-chrome'
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote'
        ]
    }
});

// Eventos do Cliente
client.on('qr', (qr) => {
    ultimoQR = qr; 
    console.log('⚠️ Novo QR Code gerado! Escaneie em /qrcode');
});

client.on('ready', () => {
    ultimoQR = ""; // Limpa o QR quando logar
    console.log('🚀 WhatsApp pronto para uso!');
});

client.on('authenticated', () => console.log('✅ Autenticado com sucesso!'));

client.initialize();

// EXPORTAÇÃO ÚNICA (O jeito certo)
module.exports = { 
    client, 
    getQR: () => ultimoQR 
};