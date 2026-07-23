#!/bin/sh
set -e

# Applique les migrations en attente avant de démarrer l'API : un conteneur
# neuf part d'un volume vide, la base doit être créée/à jour (cf. doc §3.1)
npx prisma migrate deploy

exec node dist/index.js
