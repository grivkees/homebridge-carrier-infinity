# Devcontainer Configuration

This directory contains the configuration for a GitHub Codespace / VS Code devcontainer that provides a complete Homebridge development environment.

## Files

- **devcontainer.json**: Main devcontainer configuration
  - Base image: Node.js 22 (TypeScript)
  - Auto-installs VS Code extensions (Claude Code, ESLint, Copilot, Jest, etc.)
  - Runs setup script on container creation
  - Forwards port 8581 (Homebridge UI)

- **setup-homebridge.sh**: Automated setup script that runs on container creation
  - Installs Homebridge and Homebridge Config UI X globally
  - Creates ~/.homebridge directory structure
  - Generates default config.json
  - Builds and links this plugin to Homebridge

- **config.json.example**: Template Homebridge configuration
  - Includes the Carrier Infinity platform with all options
  - Copy to ~/.homebridge/config.json and add your credentials

- **dev-scripts.md**: Development workflow documentation
  - Quick start guide
  - Common commands
  - Debugging tips

## Usage

### First Time Setup

1. Open this repository in a Codespace or devcontainer
2. Wait for the automatic setup to complete (~2-3 minutes)
3. Copy the example config: `cp .devcontainer/config.json.example ~/.homebridge/config.json`
4. Edit ~/.homebridge/config.json with your Carrier username/password
5. Start Homebridge: `homebridge -D`

### Development Workflow

**Terminal 1** (auto-rebuild):
```bash
npm run watch
```

**Terminal 2** (run Homebridge):
```bash
homebridge -D
```

Make changes to the code, and the watch command will rebuild automatically. Restart Homebridge to see changes.

### Accessing Homebridge UI

The Homebridge Config UI X is automatically available:
- Port 8581 (forwarded in codespace)
- Click the "Ports" tab in VS Code to open
- Default login: admin / admin

## What Gets Installed

- Homebridge (latest)
- Homebridge Config UI X (web interface)
- Project dependencies (from package.json)
- Plugin built and symlinked to ~/.homebridge/node_modules/

## Persistence

The following persists across codespace rebuilds:
- ~/.homebridge/config.json (your configuration)
- ~/.homebridge/ directory (accessories, cache)

The plugin code is always the latest from your working directory.
