# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy root lockfile
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared-types/package*.json ./shared-types/

# Install dependencies
RUN npm install

# Copy source
COPY shared-types/ ./shared-types/
COPY frontend/ ./frontend/

# Set env vars for build (though they can be overridden in static export, 
# it's better to have defaults)
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Build static export
WORKDIR /app/frontend
RUN npm run build

# Production stage (Caddy)
FROM caddy:alpine
# Copy static files to caddy
COPY --from=builder /app/frontend/out /usr/share/caddy/html

# We'll expect the Caddyfile to be mounted or created
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
