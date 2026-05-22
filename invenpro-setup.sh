#!/bin/bash
set -e

APP_DIR=/home/ec2-user/app

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

sudo -u ec2-user bash -c "cd $APP_DIR && pnpm install --frozen-lockfile"

cd $APP_DIR && docker compose up -d
sleep 30

sudo -u ec2-user bash -c "cd $APP_DIR && pnpm db:migrate && pnpm db:seed && pnpm build"

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
