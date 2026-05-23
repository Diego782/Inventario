#!/bin/bash
set -e

APP_DIR=/home/ec2-user/app

# .env
cat > $APP_DIR/.env << 'ENVEOF'
DATABASE_URL="mysql://invenpro:invenpro_password_change_me@localhost:3306/invenpro?charset=utf8mb4"
MYSQL_ROOT_PASSWORD=root_password_change_me
MYSQL_DATABASE=invenpro
MYSQL_USER=invenpro
MYSQL_PASSWORD=invenpro_password_change_me
TZ=America/Mexico_City
PRINTER_NAME=
ENVEOF
chown ec2-user:ec2-user $APP_DIR/.env

# pnpm install (ya corrido antes, pero idempotente)
sudo -u ec2-user bash -c "cd $APP_DIR && pnpm install --frozen-lockfile"

# Levantar MySQL — docker compose V2 puede estar en distintos paths en AL2023
export PATH=$PATH:/usr/libexec/docker/cli-plugins
cd $APP_DIR
if docker compose version &>/dev/null; then
  docker compose up -d
elif command -v docker-compose &>/dev/null; then
  docker-compose up -d
else
  # Instalar plugin compose si no existe
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose up -d
fi

echo "Esperando que MySQL arranque..."
sleep 30

# Migraciones, seed y build
sudo -u ec2-user bash -c "cd $APP_DIR && pnpm exec prisma generate && pnpm db:migrate && pnpm db:seed && pnpm build"

# Servicio systemd
cat > /etc/systemd/system/invenpro.service << 'SVCEOF'
[Unit]
Description=InvenPro Next.js
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/app
ExecStart=/usr/local/bin/pnpm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable invenpro
systemctl start invenpro
echo "=== InvenPro levantado en puerto 3000 ==="
