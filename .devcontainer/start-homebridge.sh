#!/bin/bash
# Start Homebridge and Config UI automatically using pm2
# This script is run by the devcontainer postStartCommand

echo "Starting Homebridge and Config UI with pm2..."

# Stop any existing instance (in case of restart)
pm2 delete homebridge 2>/dev/null || true

# Start hb-service using pm2
pm2 start hb-service --name homebridge -- run -U ~/.homebridge

# Save pm2 process list
pm2 save

# Wait a moment for startup
sleep 3

# Check if it's running
if curl -s http://localhost:8581 > /dev/null 2>&1; then
    echo "✅ Homebridge and Config UI started successfully!"
    echo "   - Homebridge UI: http://localhost:8581"
    echo "   - Default credentials: admin/admin"
    echo "   - Logs: pm2 logs homebridge"
    echo "   - Status: pm2 status"
else
    echo "⚠️  Homebridge may still be starting..."
    echo "   Check logs: pm2 logs homebridge"
fi
