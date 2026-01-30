#!/bin/bash
set -e

echo "Setting up Homebridge development environment..."

# Install Homebridge globally
echo "Installing Homebridge..."
sudo npm install -g --unsafe-perm homebridge homebridge-config-ui-x

# Create Homebridge directory structure
echo "Creating Homebridge directory structure..."
mkdir -p ~/.homebridge

# Create default config if it doesn't exist
if [ ! -f ~/.homebridge/config.json ]; then
    echo "Creating Homebridge config from example..."
    cp .devcontainer/config.json.example ~/.homebridge/config.json
fi

# Install project dependencies
echo "Installing project dependencies..."
npm install

# Build the plugin
echo "Building plugin..."
npm run build

# Link the plugin to Homebridge
echo "Linking plugin to Homebridge..."
PLUGIN_PATH="$(pwd)"
HOMEBRIDGE_PATH="$HOME/.homebridge/node_modules"
PLUGIN_NAME="homebridge-carrier-infinity"

mkdir -p "$HOMEBRIDGE_PATH"
ln -sf "$PLUGIN_PATH" "$HOMEBRIDGE_PATH/$PLUGIN_NAME"

echo ""
echo "✅ Homebridge development environment setup complete!"
echo ""
echo "Quick start:"
echo "  1. Edit ~/.homebridge/config.json to add your Carrier credentials"
echo "  2. Run 'homebridge' to start Homebridge"
echo "  3. Run 'npm run watch' in another terminal for auto-rebuild"
echo ""
