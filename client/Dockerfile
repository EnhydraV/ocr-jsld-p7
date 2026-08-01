# Front React/Vite servi par nginx — multi-stage, cf. DOCUMENTATION.md §3.1
#
# Bases épinglées par digest (immuable, contrairement au tag) : même protection
# de chaîne d'approvisionnement que les actions du pipeline (§ 8.2). Digest et
# tag maintenus ensemble par Dependabot — pas d'ARG dans les FROM, son parseur
# docker ne les résout pas (§ 8.1).

# --- Étage builder : build Vite dans /app/dist ---
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Étage final : nginx non-root (NGINX Inc., port non privilégié 8080) ---
FROM nginxinc/nginx-unprivileged:alpine@sha256:59ccf0943b0b8e8d9e6ea9039a39555730f544701a655c596f7df7d096c593f5 AS runner

# Server block : statiques SPA + reverse proxy /api > server:8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

# 127.0.0.1 explicite : localhost se résout en ::1 (IPv6) dans le conteneur,
# or nginx n'écoute qu'en IPv4 - connection refused sinon
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
