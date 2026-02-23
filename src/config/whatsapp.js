require('dotenv').config();

module.exports = {
    baseUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE_NAME,
    
    // Helper para montar os headers das requisições com o Token do .env
    headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY
    }
};