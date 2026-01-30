#!/bin/bash
# Stop Homebridge managed by pm2

echo "Stopping Homebridge..."
pm2 delete homebridge

echo "✅ Homebridge stopped"
