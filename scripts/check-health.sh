#!/usr/bin/env bash
# check-health.sh — Verifica saúde do AtlasX e reinicia se necessário
# Uso: ./scripts/check-health.sh
# Recomendado: crontab -e → */5 * * * * /var/www/atlasx/scripts/check-health.sh
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3000/health}"
APP_NAME="${PM2_APP:-atlasx}"
LOG_FILE="${LOG_FILE:-/var/log/atlasx-health.log}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

response=$(curl -sf --max-time 5 "$API_URL" 2>/dev/null || echo "")

if [ -z "$response" ]; then
  log "ERRO: API não respondeu em $API_URL"
  log "Reiniciando PM2 app '$APP_NAME'..."
  pm2 restart "$APP_NAME" 2>>"$LOG_FILE" || log "FALHA ao reiniciar PM2"

  if [ -n "$NOTIFY_EMAIL" ]; then
    echo "AtlasX estava fora do ar e foi reiniciado em $(hostname) às $(date)" \
      | mail -s "[AtlasX] Reinicialização automática" "$NOTIFY_EMAIL" 2>/dev/null || true
  fi
  exit 1
fi

db_ok=$(echo "$response" | grep -o '"ok":true' || true)
if [ -z "$db_ok" ]; then
  log "AVISO: API respondeu mas banco está desconectado: $response"
  if [ -n "$NOTIFY_EMAIL" ]; then
    echo "AtlasX: banco MongoDB desconectado em $(hostname) às $(date). Resposta: $response" \
      | mail -s "[AtlasX] MongoDB desconectado" "$NOTIFY_EMAIL" 2>/dev/null || true
  fi
  exit 1
fi

log "OK: $response"
