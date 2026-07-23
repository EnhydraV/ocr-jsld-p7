# API Express + Prisma/SQLite — multi-stage, cf. DOCUMENTATION.md §3.1
ARG NODE_VERSION=22-alpine

# --- Étage builder : compilation TypeScript ---
FROM node:${NODE_VERSION} AS builder

# Requis par Prisma pour détecter la variante de moteur (linux-musl-openssl-3.0.x) ;
# sans lui, il retombe sur les moteurs openssl-1.1 incompatibles avec alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
# Client Prisma requis pour la vérification de types du build
RUN npx prisma generate

COPY . .
RUN npm run build

# --- Étage final : dépendances de production uniquement ---
FROM node:${NODE_VERSION} AS runner

# Même exigence qu'au build : détection OpenSSL 3 par Prisma au runtime
RUN apk add --no-cache openssl

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
# Régénéré dans l'image finale : le moteur Prisma dépend de la plateforme (musl/alpine)
RUN npx prisma generate
# Force le téléchargement de tous les moteurs (dont le schema engine utilisé par
# migrate deploy) pendant le build, en root : à l'exécution, l'utilisateur non-root
# ne peut — et ne doit — rien écrire dans node_modules
RUN npx prisma version >/dev/null

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./

# La base SQLite vit dans un volume monté sur /app/data
ENV DATABASE_URL=file:/app/data/orion.db
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
