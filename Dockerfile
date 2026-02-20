FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências (sem baixar o chrome de novo, pois já está na imagem)
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta que o Render usa
EXPOSE 10000

# Comando para iniciar a API
CMD ["node", "server.js"]