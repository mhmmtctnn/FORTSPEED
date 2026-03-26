# Frontend: React + Vite + Nginx
FROM node:20-alpine AS builder

WORKDIR /app

# Dependencies yükle
COPY package*.json ./
RUN npm install

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
