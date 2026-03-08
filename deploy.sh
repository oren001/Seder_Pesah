#!/bin/bash

# 🕍 AI Haggadah - One-Click Deployment Script for Vultr/VPS
# This script installs Docker, clones the repo, and starts the Haggadah stack.

set -e

echo "🚀 Starting AI Haggadah Deployment..."

# 1. Update and install dependencies
sudo apt-get update
sudo apt-get install -y git curl

# 2. Install Docker if not present
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
fi

# 3. Clone repository
if [ -d "Seder_Pesah" ]; then
    echo "📂 Syncing latest code..."
    cd Seder_Pesah
    git pull origin master
else
    echo "📂 Cloning repository..."
    git clone https://github.com/oren001/Seder_Pesah.git
    cd Seder_Pesah
fi

# 4. Get Public IP
IP_ADDR=$(curl -s ifconfig.me)
echo "🌐 Detected Public IP: $IP_ADDR"

# 5. Create .env file (printf for CRLF safety)
echo "📝 Configuring environment..."
mkdir -p backend
DOMAIN="${IP_ADDR}.nip.io"
printf "DOMAIN=$DOMAIN\n" > backend/.env
# Through Caddy, the API is available on the same domain
printf "NEXT_PUBLIC_BACKEND_URL=https://$DOMAIN\n" >> backend/.env
printf "FRONTEND_URL=https://$DOMAIN\n" >> backend/.env
printf "NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCcnpQDPsQptHdZKHupXOZNqNbO1JOD1Ss\n" >> backend/.env
printf "NEXT_PUBLIC_FIREBASE_PROJECT_ID=general-4686c\n" >> backend/.env
printf "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=general-4686c.firebasestorage.app\n" >> backend/.env
printf "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=810223700186\n" >> backend/.env
printf "NEXT_PUBLIC_FIREBASE_APP_ID=1:810223700186:web:7eeeac4b4e0f921cd7fde3\n" >> backend/.env
printf "PORT=3001\n" >> backend/.env
printf "NODE_ENV=production\n" >> backend/.env

# Copy root .env to frontend build args
cp backend/.env .env

# 6. Setup Local Data Directory (Bypassing Firebase)
echo "🗄️ Setting up local JSON database directory..."
mkdir -p backend/data
chmod 777 backend/data

# 7. Start the stack
echo "🏗️  Building and starting Docker containers..."
ls -la .
ls -la backend
sudo docker compose up -d --build

echo "✅ DEPLOYMENT COMPLETE!"
echo "🕍 Your AI Haggadah is live at: http://$IP_ADDR"
