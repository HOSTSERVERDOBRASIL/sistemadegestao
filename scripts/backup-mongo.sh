#!/usr/bin/env bash
# backup-mongo.sh — Backup do MongoDB AtlasX
# Uso: ./scripts/backup-mongo.sh
# Recomendado: crontab -e → 0 3 * * * /var/www/atlasx/scripts/backup-mongo.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/atlasx}"
DB_NAME="${DB_NAME:-atlasX}"
MONGO_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/$DB_NAME}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
DEST="$BACKUP_DIR/$DATE"

mkdir -p "$DEST"

echo "[backup] Iniciando dump de $DB_NAME em $DEST"
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --out="$DEST" --gzip

echo "[backup] Compactando..."
tar -czf "$BACKUP_DIR/atlasx_$DATE.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$DEST"

echo "[backup] Removendo backups com mais de $KEEP_DAYS dias..."
find "$BACKUP_DIR" -name "atlasx_*.tar.gz" -mtime +"$KEEP_DAYS" -delete

echo "[backup] Concluído: $BACKUP_DIR/atlasx_$DATE.tar.gz"
ls -lh "$BACKUP_DIR/atlasx_$DATE.tar.gz"
