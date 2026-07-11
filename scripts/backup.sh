#!/usr/bin/env bash
# Respaldo de Consultoría Control (RF-TEC-012)
# Uso: ./scripts/backup.sh
# Requiere docker y el stack levantado (volumen consultoria-control_pgdata).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/$TIMESTAMP"
mkdir -p "$DEST"

echo "[backup] volcando base de datos..."
docker compose exec -T postgres pg_dump -U consultoria -d consultoria -F c > "$DEST/db.dump" \
  || docker exec consultoria-control-postgres-1 pg_dump -U consultoria -d consultoria -F c > "$DEST/db.dump"

echo "[backup] copiando archivos subidos (/uploads)..."
docker compose cp server:/uploads "$DEST/uploads" 2>/dev/null \
  || docker cp consultoria-control-server-1:/uploads "$DEST/uploads" 2>/dev/null \
  || echo "[backup] aviso: no se pudieron copiar archivos (¿ruta distinta?)"

echo "[backup] listo en $DEST"
ls -la "$DEST"
