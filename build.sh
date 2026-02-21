#!/usr/bin/env bash
# Instala as dependências do sistema para o Chrome rodar no Render
apt-get update && apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libxshmfence1 \
  --no-install-recommends

# Instala as dependências do Node
npm install