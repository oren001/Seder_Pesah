#!/bin/bash

# 🕍 AI Haggadah - One-Click Deployment Script
# Consolidated Ashkenaz Version

set -e

echo "🚀 Starting AI Haggadah Deployment..."

# 1. Update and install dependencies
# apt-get update
# apt-get install -y git curl

# 2. Install Docker if not present
# if ! [ -x "$(command -v docker)" ]; then
#     echo "🐳 Installing Docker..."
#     curl -fsSL https://get.docker.com | sh
#     # usermod -aG docker $USER
# fi

# 3. Clone/Sync repository
# In this environment, we are already in the correct directory.
# git pull origin master

# 4. Configure environment
echo "📝 Configuring environment..."
IP_ADDR=$(curl -s ifconfig.me)
DOMAIN="beta.${IP_ADDR}.nip.io"

# Create .env for Docker
printf "DOMAIN=$DOMAIN\n" > .env
printf "PORT=3001\n" >> .env
printf "NODE_ENV=production\n" >> .env
printf "LEONARDO_API_KEY=03028d8e-afc4-46f6-b967-069fc4fc01a1\n" >> .env

# 5. Bump Version
# Keeping the version I already set in version.json
echo "🏷️  Version v1605 confirmed."

# 6. Start the stack
echo "🏗️  Building and starting Docker containers..."
docker compose down || true
docker compose up -d --build

echo "✅ DEPLOYMENT COMPLETE!"
echo "🕍 Your AI Haggadah is live at: https://$DOMAIN"
