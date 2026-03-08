# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy root lockfile if it exists, or just the workspace ones
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared-types/package*.json ./shared-types/

# Install dependencies (using workspaces)
RUN npm install

# Copy source
COPY shared-types/ ./shared-types/
COPY backend/ ./backend/

# Build backend
WORKDIR /app/backend
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/backend/package*.json ./
RUN npm install --production

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/shared-types ./shared-types

# The app logic looks for service-account.json at ../service-account.json relative to dist/src
# So we place it in the root of /app
# User should mount this file or we can provide a dummy if env vars are used
RUN touch service-account.json

EXPOSE 3001
CMD ["npm", "start"]
