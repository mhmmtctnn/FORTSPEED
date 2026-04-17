# Frontend: React + Vite + Nginx
FROM node:20-alpine AS builder

WORKDIR /app

ARG ITAI_MODE=false
ENV VITE_ITAI_MODE=$ITAI_MODE

# Dependencies yükle
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefer-offline

# Source kod kopyala
COPY . .

# React build et
RUN npm run build

# Nginx production stage
FROM nginx:alpine

# Nginx config kopyala
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Build çıktısını Nginx'e kopyala
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
