const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // No Windows ele usa o Chrome padrão, no Render ele usa o binário do Linux
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Mostra o status no console
client.on('ready', () => console.log('🚀 WhatsApp pronto para uso!'));
client.on('qr', (qr) => console.log('⚠️ Novo QR Code gerado. Vá para a tela de login.'));

client.initialize();

module.exports = { client };

// Adicione essa variável no topo do arquivo whatsapp.js
let ultimoQR = "";

client.on('qr', (qr) => {
    ultimoQR = qr; // Salva o código aqui quando ele for gerado
    console.log('⚠️ Novo QR Code gerado!');
});

// Exporte a variável junto com o client
module.exports = { client, getQR: () => ultimoQR };