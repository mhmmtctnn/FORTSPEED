# Backend: Node.js + Fastify (Production build)
FROM node:20-alpine AS builder

WORKDIR /app

# Tüm bağımlılıkları yükle (dev dahil — derleme için gerekli)
COPY package*.json ./
RUN npm install

# Source kopyala ve TypeScript derle
COPY . .
RUN npm run build

# ------- Runtime stage -------
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Derlenmiş JS'i kopyala
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
