FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY server.js leonardo.js ./
COPY public/ ./public/

# Environment variables
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
