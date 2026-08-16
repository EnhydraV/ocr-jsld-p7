#!/usr/bin/env bash
# Raccourci de démarrage — strictement la séquence documentée dans le README,
# qui reste la référence. Le script n'ajoute qu'une chose : l'attente ACTIVE des
# services, `docker compose up` rendant la main quand le conteneur tourne et non
# quand le service répond.
#
#   ./run.sh          démarre tout et crée les dashboards (rejouable)
#   ./run.sh down     arrête les deux stacks
set -euo pipefail

cd "$(dirname "$0")"

ES_URL="http://localhost:9200"
KIBANA_URL="http://localhost:5601"
API_HEALTH="http://localhost:8080/api/health"
ELK="elk/docker-compose.yml"
TIMEOUT=300

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '    /!\\ %s\n' "$1" >&2; }

http_ok() { curl -fsS -o /dev/null "$1"; }

# `_cat/indices` répond 200 avec un corps VIDE quand le motif ne correspond à
# rien : c'est la présence de sortie qui fait foi, pas le code HTTP.
index_exists() { [ -n "$(curl -fsS "$ES_URL/_cat/indices/$1?h=index" 2>/dev/null)" ]; }

wait_until() {
  local label=$1 deadline=$((SECONDS + TIMEOUT))
  shift
  printf '    %s ' "$label"
  until "$@" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      printf 'ÉCHEC\n'
      warn "abandon après ${TIMEOUT}s — condition testée : $*"
      return 1
    fi
    printf '.'
    sleep 2
  done
  printf ' prêt\n'
}

if [ "${1:-up}" = "down" ]; then
  step "Arrêt"
  # ELK d'abord : elle est raccordée au réseau créé par la stack applicative.
  docker compose -f "$ELK" down
  docker compose down
  printf '\n    Volumes conservés. `down -v` détruirait la base ; ./backups y survivrait.\n'
  exit 0
fi

step "Vérifications préalables"
command -v docker >/dev/null || { warn "docker est introuvable"; exit 1; }
command -v curl >/dev/null || { warn "curl est introuvable"; exit 1; }
[ -f elk/.env ] || { warn "elk/.env absent : le copier depuis elk/.env.example (GITHUB_TOKEN requis)"; exit 1; }
[ -f .env ] || warn ".env absent : les logs applicatifs n'iront pas dans Kibana"
printf '    ok\n'

step "Stack applicative"
docker compose pull
docker compose up -d --wait --wait-timeout "$TIMEOUT"

step "Stack ELK"
# La stack applicative vient de créer le réseau `orion`, que ce compose déclare
# `external` et ne sait pas créer : l'ordre n'est pas négociable.
docker compose -f "$ELK" pull
docker compose -f "$ELK" up -d
wait_until "Elasticsearch " http_ok "$ES_URL/_cluster/health"
wait_until "Kibana        " http_ok "$KIBANA_URL/api/status"

step "Reconnexion des logs applicatifs"
# Le transport Winston → Logstash ne se connecte qu'au DÉMARRAGE du processus :
# quatre tentatives, puis il se tait pour ne pas gêner l'application. Les
# conteneurs applicatifs ayant démarré avant Logstash, ils ont déjà renoncé.
docker compose restart server backup
wait_until "API           " http_ok "$API_HEALTH"
# Un peu de trafic : l'index orion-logs-* n'existe qu'à la première ligne reçue,
# et Kibana refuse une data view dont le motif ne correspond à aucun index.
for _ in 1 2 3; do curl -fsS -o /dev/null "$API_HEALTH" || true; done

step "Métriques et dashboards"
[ -d tools/node_modules ] || (cd tools && npm ci --no-audit --silent)
(cd tools && npm run --silent dora:index -- --refresh) || warn "dora:index a échoué — l'indexer réessaiera dans l'heure"
(cd tools && npm run --silent deps:index) || warn "deps:index a échoué (GITHUB_TOKEN dans tools/.env ?)"
wait_until "index des logs" index_exists "orion-logs-*" || warn "aucun log indexé : la data view des logs manquera"
(cd tools && npm run --silent kibana:setup)

step "Prêt"
cat <<EOF
    Application    http://localhost:4200
    API            ${API_HEALTH}
    Kibana         ${KIBANA_URL}/app/dashboards

    Arrêt : ./run.sh down
EOF
