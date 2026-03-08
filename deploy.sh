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

# 5. Create .env file for build
echo "📝 Configuring environment..."
cat <<EOF > .env
NEXT_PUBLIC_BACKEND_URL=http://$IP_ADDR:3001
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCcnpQDPsQptHdZKHupXOZNqNbO1JOD1Ss
NEXT_PUBLIC_FIREBASE_PROJECT_ID=general-4686c
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=general-4686c.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=810223700186
NEXT_PUBLIC_FIREBASE_APP_ID=1:810223700186:web:7eeeac4b4e0f921cd7fde3
EOF

# 6. Check for Firebase Service Account
if [ ! -f "backend/service-account.json" ]; then
    echo "⚠️  WARNING: backend/service-account.json NOT FOUND!"
    echo "The backend container will start but Firestore will fail."
    echo "Please upload your service-account.json to this folder and restart."
fi

# 7. Start the stack
echo "🏗️  Building and starting Docker containers..."
docker compose up -d --build

echo "✅ DEPLOYMENT COMPLETE!"
echo "🕍 Your AI Haggadah is live at: http://$IP_ADDR"
echo "------------------------------------------------"
echo "Note: If the frontend can't connect, ensure port 3001 is open in your firewall."
