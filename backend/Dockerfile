# Backend: Node.js + Fastify (Production build)
FROM node:20-alpine AS builder

ARG ITAI_MODE=false
ENV ITAI_MODE=${ITAI_MODE}

WORKDIR /app

# Tüm bağımlılıkları yükle (dev dahil — derleme için gerekli)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

# Source kopyala ve TypeScript derle
COPY . .
RUN npm run build

# ------- Runtime stage -------
FROM node:20-alpine

ARG ITAI_MODE=false
ENV ITAI_MODE=${ITAI_MODE}

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline

# Derlenmiş JS'i kopyala
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
