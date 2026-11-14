#!/usr/bin/env bash
# Levanta bdMY (PostgreSQL) y backMy (API) en el servidor con docker puro (no requiere docker compose).
# Se corre EN el servidor, dentro de ~/miky, después de cargar las imágenes:
#   docker load < miky-backmy.tar.gz   (lo hace subir-al-servidor.sh desde la Mac)
#   bash despliegue/levantar-servidor.sh
# Es idempotente: si ya existen, recrea el contenedor del API y deja la base y sus datos intactos.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
: "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}" "${ADMIN_EMAIL:?}" "${ADMIN_PASSWORD:?}"
DB="${POSTGRES_DB:-miky}"; USR="${POSTGRES_USER:-miky}"
API_BIND="${API_BIND:-172.17.0.1:3090}"   # interfaz interna de Docker: no queda expuesto a internet

docker network inspect miky >/dev/null 2>&1 || docker network create miky >/dev/null
docker volume create miky_dbdata >/dev/null
docker volume create miky_uploads >/dev/null

# --- bdMY: sólo se crea si no existe (nunca se borra la base) ---
if ! docker container inspect miky-bdMY >/dev/null 2>&1; then
  docker run -d --name miky-bdMY --network miky --network-alias bdMY --restart unless-stopped \
    -e POSTGRES_DB="$DB" -e POSTGRES_USER="$USR" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e TZ=America/Mexico_City \
    -v miky_dbdata:/var/lib/postgresql/data \
    -v "$PWD/bdMY/init:/docker-entrypoint-initdb.d:ro" \
    --health-cmd "pg_isready -U $USR -d $DB" --health-interval 5s --health-retries 20 \
    postgres:16-alpine >/dev/null
  echo "bdMY creada."
else
  docker start miky-bdMY >/dev/null
  echo "bdMY ya existía (datos intactos)."
fi

echo -n "Esperando a bdMY"
until [ "$(docker inspect -f '{{.State.Health.Status}}' miky-bdMY)" = healthy ]; do echo -n .; sleep 2; done; echo

# --- backMy: se recrea con la imagen nueva ---
docker rm -f miky-backMy >/dev/null 2>&1 || true
docker run -d --name miky-backMy --network miky --network-alias backMy --restart unless-stopped \
  -e DATABASE_URL="postgres://$USR:$POSTGRES_PASSWORD@bdMY:5432/$DB" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e COOKIE_SECURE=true -e UPLOAD_DIR=/data/uploads -e TZ=America/Mexico_City \
  -v miky_uploads:/data/uploads \
  -v "$PWD/bdMY/migraciones:/app/migrations:ro" \
  -p "$API_BIND:3000" \
  miky-backmy:latest >/dev/null

echo -n "Esperando al API"
for _ in $(seq 1 60); do curl -sf "http://$API_BIND/api/health" >/dev/null && break; echo -n .; sleep 2; done; echo
curl -s "http://$API_BIND/api/health"; echo
docker logs miky-backMy 2>&1 | tail -3
