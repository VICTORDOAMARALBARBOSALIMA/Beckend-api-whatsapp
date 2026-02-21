const { Client, LocalAuth } = require('whatsapp-web.js');

let ultimoQR = "";

const client = new Client({
    authStrategy: new LocalAuth({ 
        // O Render vai salvar a sessão aqui dentro do Disk de 1GB
        dataPath: '/app/tokens' 
    }),
    puppeteer: {
        headless: true,
        // O "Pulo do Gato" para Docker no Render:
        executablePath: '/usr/bin/google-chrome-stable', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process', // Ajuda a economizar RAM no Render
        ],
    }
});

// Eventos do Cliente
client.on('qr', (qr) => {
    ultimoQR = qr; 
    console.log('⚠️ Novo QR Code gerado! Escaneie no Mocha em /qrcode');
});

client.on('ready', () => {
    ultimoQR = ""; 
    console.log('🚀 WhatsApp conectado e pronto!');
});

client.on('authenticated', () => {
    console.log('✅ Sessão autenticada! Arquivos salvos em /app/tokens');
});

// Tratamento de erro para evitar que a API caia se o WhatsApp desconectar
client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp desconectado:', reason);
    client.initialize(); // Tenta reconectar automaticamente
});

client.initialize();

module.exports = { 
    client, 
    getQR: () => ultimoQR 
};