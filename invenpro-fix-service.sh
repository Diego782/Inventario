#!/bin/bash
set -e

PNPM_PATH=$(which pnpm)
echo "pnpm encontrado en: $PNPM_PATH"

systemctl stop invenpro || true

cat > /etc/systemd/system/invenpro.service << SVCEOF
[Unit]
Description=InvenPro Next.js
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/app
ExecStart=$PNPM_PATH start
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
sleep 8
systemctl is-active invenpro
ss -tlnp | grep 3000 && echo "Puerto 3000 escuchando OK" || echo "Puerto 3000 NO encontrado"
