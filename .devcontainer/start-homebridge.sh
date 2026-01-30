#!/bin/bash
# Start Homebridge and Config UI automatically
# This script is run by the devcontainer postStartCommand

echo "Starting Homebridge and Config UI..."

# Start hb-service in the background
nohup hb-service run -U ~/.homebridge > ~/.homebridge/hb-service.log 2>&1 &

# Wait a moment for startup
sleep 3

# Check if it's running
if curl -s http://localhost:8581 > /dev/null 2>&1; then
    echo "✅ Homebridge and Config UI started successfully!"
    echo "   - Homebridge UI: http://localhost:8581"
    echo "   - Default credentials: admin/admin"
    echo "   - Logs: ~/.homebridge/homebridge.log"
else
    echo "⚠️  Homebridge may still be starting..."
    echo "   Check logs: tail -f ~/.homebridge/homebridge.log"
fi
