#!/usr/bin/env bash
# Desde la Mac: construye las imágenes para el servidor (amd64), las sube por SSH y levanta Miky.
# El servidor no descarga nada de internet: todo sale de aquí.
#   bash despliegue/subir-al-servidor.sh            (por defecto city@45.232.252.81)
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER="${1:-city@45.232.252.81}"

echo "1/4  Construyendo backMy (linux/amd64)…"
docker buildx build --platform linux/amd64 -t miky-backmy:latest --load ./backMy >/dev/null

echo "2/4  Preparando PostgreSQL 16 (linux/amd64)…"
docker pull --quiet --platform linux/amd64 postgres:16-alpine >/dev/null

echo "3/4  Enviando código e imágenes a ${SERVER}…"
ssh "$SERVER" 'mkdir -p ~/miky && chmod 700 ~/miky'
rsync -az --delete backMy bdMY despliegue "$SERVER":~/miky/
docker save miky-backmy:latest postgres:16-alpine | gzip | ssh "$SERVER" 'gunzip | docker load' | sed 's/^/     /'

echo "4/4  Levantando en el servidor…"
ssh "$SERVER" 'cd ~/miky && bash despliegue/levantar-servidor.sh'
