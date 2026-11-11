#!/usr/bin/env bash
# Build the image locally and ship it to aeza-de (the shared 4 GB server thrashes on `vite build`).
#   deploy/ship.sh            # build, upload, restart web + worker
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -q -t counterclaim:latest .
docker save counterclaim:latest | gzip -1 | ssh aeza-de 'gunzip | docker load -q'
ssh aeza-de 'cd ~/counterclaim && git pull -q && docker compose -f deploy/compose.yaml --env-file .env up -d --no-build 2>&1 | tail -2'
