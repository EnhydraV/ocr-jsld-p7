# Front React/Vite servi par nginx — multi-stage, cf. DOCUMENTATION.md §3.1
ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=alpine

# --- Étage builder : build Vite dans /app/dist ---
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Étage final : nginx non-root (NGINX Inc., port non privilégié 8080) ---
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runner

# Server block : statiques SPA + reverse proxy /api > server:8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/ || exit 1
