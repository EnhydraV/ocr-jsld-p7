#!/bin/sh
set -e

# Applique les migrations en attente avant de démarrer l'API : un conteneur
# neuf part d'un volume vide, la base doit être créée/à jour (cf. doc §3.1).
# Appel direct du binaire : npm/npx sont supprimés de l'image finale
./node_modules/.bin/prisma migrate deploy

exec node dist/index.js
