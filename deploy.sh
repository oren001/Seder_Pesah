#!/bash

# 🕍 AI Haggadah - One-Click Deployment Script
# Consolidated Ashkenaz Version

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

# 3. Clone/Sync repository
if [ -d "Seder_Pesah" ]; then
    echo "📂 Syncing latest code..."
    cd Seder_Pesah
    git reset --hard origin/master
    git pull origin master
else
    echo "📂 Cloning repository..."
    git clone https://github.com/oren001/Seder_Pesah.git
    cd Seder_Pesah
fi

# 4. Configure environment
echo "📝 Configuring environment..."
IP_ADDR=$(curl -s ifconfig.me)
DOMAIN="${IP_ADDR}.nip.io"

# Create .env for Docker
printf "DOMAIN=$DOMAIN\n" > .env
printf "PORT=3001\n" >> .env
printf "NODE_ENV=production\n" >> .env
printf "LEONARDO_API_KEY=642a8b38-66df-4993-9799-281fd8987d60\n" >> .env

# 5. Start the stack
echo "🏗️  Building and starting Docker containers..."
sudo docker compose down || true
sudo docker compose up -d --build

echo "✅ DEPLOYMENT COMPLETE!"
echo "🕍 Your Ashkenaz AI Haggadah is live at: https://$DOMAIN"
