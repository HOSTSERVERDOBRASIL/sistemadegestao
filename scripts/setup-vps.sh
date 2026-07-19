#!/usr/bin/env bash
# setup-vps.sh — Configuração inicial do VPS para AtlasX
# Domínio: gerenciamento.xdigitalbrasil.com.br
# Ubuntu 22.04 / 24.04
#
# Execute como root ou com sudo:
#   bash scripts/setup-vps.sh

set -euo pipefail

DOMAIN="gerenciamento.xdigitalbrasil.com.br"
DEPLOY_PATH="/opt/atlasX"
APP_USER="atlasX"
NODE_VERSION="22"
EMAIL="seu@email.com"   # <-- altere para receber alertas do Let's Encrypt

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Execute como root: sudo bash $0"

# ─── 1. Atualiza o sistema ────────────────────────────────────────────────────
info "Atualizando pacotes..."
apt-get update -qq && apt-get upgrade -y -qq

# ─── 2. Instala dependências base ─────────────────────────────────────────────
info "Instalando nginx, certbot, curl, git..."
apt-get install -y -qq nginx certbot python3-certbot-nginx curl git ufw

# ─── 3. Node.js via NodeSource ───────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -c2- | cut -d. -f1) -lt $NODE_VERSION ]]; then
    info "Instalando Node.js $NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
fi
info "Node $(node -v) / npm $(npm -v)"

# ─── 4. PM2 global ───────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "Instalando PM2..."
    npm install -g pm2 --loglevel=error
fi
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ─── 5. MongoDB 7 ────────────────────────────────────────────────────────────
if ! command -v mongod &>/dev/null; then
    info "Instalando MongoDB 7..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -qq && apt-get install -y -qq mongodb-org
    systemctl enable --now mongod
fi
info "MongoDB $(mongod --version | head -1)"

# ─── 6. Usuário de deploy (opcional, para SSH key deploy) ────────────────────
if ! id "$APP_USER" &>/dev/null; then
    info "Criando usuário $APP_USER..."
    useradd -m -s /bin/bash "$APP_USER"
fi

# ─── 7. Diretório do projeto ──────────────────────────────────────────────────
info "Preparando $DEPLOY_PATH..."
mkdir -p "$DEPLOY_PATH"
mkdir -p "$DEPLOY_PATH/logs"
mkdir -p "$DEPLOY_PATH/uploads"

if [[ ! -d "$DEPLOY_PATH/.git" ]]; then
    warn "Repositório não encontrado em $DEPLOY_PATH."
    warn "Clone manualmente:"
    warn "  git clone git@github.com:SEU_USUARIO/SEU_REPO.git $DEPLOY_PATH"
    warn "Depois execute: bash $DEPLOY_PATH/scripts/setup-vps.sh novamente ou continue manualmente."
fi

# ─── 8. Nginx — instala a config ─────────────────────────────────────────────
info "Configurando nginx para $DOMAIN..."
cp "$DEPLOY_PATH/nginx.conf" /etc/nginx/sites-available/atlasx 2>/dev/null || \
    warn "nginx.conf não encontrado em $DEPLOY_PATH — copie manualmente depois."

# Desativa o site default e ativa o atlasx
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/atlasx /etc/nginx/sites-enabled/atlasx

# Valida sintaxe (pode falhar antes do SSL existir, mas verifica o resto)
nginx -t 2>/dev/null && systemctl reload nginx || true

# ─── 9. Firewall ─────────────────────────────────────────────────────────────
info "Configurando UFW..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ─── 10. Certificado SSL via Certbot ─────────────────────────────────────────
info "Emitindo certificado SSL para $DOMAIN..."
certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --redirect

# Renova automaticamente via systemd (já instalado pelo certbot)
systemctl enable --now certbot.timer 2>/dev/null || \
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -

# ─── 11. Build e start da aplicação ──────────────────────────────────────────
if [[ -d "$DEPLOY_PATH/.git" ]]; then
    info "Instalando dependências e fazendo build..."
    cd "$DEPLOY_PATH"

    npm ci --omit=dev
    cd frontend && npm ci && npm run build && cd ..
    npx tsc -p tsconfig.json

    if [[ ! -f "$DEPLOY_PATH/.env" ]]; then
        error "Arquivo .env não encontrado em $DEPLOY_PATH! Crie-o a partir de .env.example antes de continuar."
    fi

    info "Iniciando aplicação com PM2..."
    pm2 start ecosystem.config.cjs || pm2 reload atlasX --update-env
    pm2 save
fi

# ─── 12. Reload nginx final ───────────────────────────────────────────────────
nginx -t && systemctl reload nginx

info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Deploy concluído!"
info "  App:  https://$DOMAIN"
info "  Logs: pm2 logs atlasX-api"
info "  API:  https://$DOMAIN/api/health"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
