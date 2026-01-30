# Devcontainer Development Environment

This directory contains configuration for a complete Homebridge development environment that runs in GitHub Codespaces or VS Code devcontainers.

## What Happens Automatically

### On Container Creation (First Time)
The setup script ([setup-homebridge.sh](setup-homebridge.sh)) automatically:
- Installs Homebridge and Homebridge Config UI X globally
- Creates `~/.homebridge/` directory structure
- Copies [config.json.example](config.json.example) to `~/.homebridge/config.json`
- Installs project dependencies
- Builds the plugin
- Symlinks the plugin to `~/.homebridge/node_modules/`

### On Every Container Start
The startup script ([start-homebridge.sh](start-homebridge.sh)) automatically:
- Starts Homebridge and Config UI via `hb-service`
- Verifies the UI is accessible on port 8581
- Displays status information

**Result**: When you open the codespace, Homebridge is already running and ready to use!

## Quick Start

### 1. Configure Credentials
Edit your Carrier Infinity credentials:

**Option A** - Via Config UI (easiest):
- Open http://localhost:8581 (credentials: admin/admin)
- Navigate to the CarrierInfinity platform settings
- Update username and password

**Option B** - Via command line:
```bash
nano ~/.homebridge/config.json
```

### 2. Development Workflow

**Automatic rebuild** (recommended):
```bash
npm run watch
```
This watches for file changes and rebuilds automatically.

**After making changes**:
```bash
# Restart Homebridge to pick up plugin changes
pkill homebridge && .devcontainer/start-homebridge.sh
```

## Configuration Files

| File | Purpose |
|------|---------|
| **devcontainer.json** | Main devcontainer configuration |
| **setup-homebridge.sh** | One-time setup script (runs on container creation) |
| **start-homebridge.sh** | Startup script (runs on every container start) |
| **config.json.example** | Template Homebridge configuration |

### devcontainer.json Features
- Base image: Node.js 22 (TypeScript)
- Auto-installs VS Code extensions (Claude Code, ESLint, Copilot, Jest, etc.)
- Forwards port 8581 (Homebridge Config UI)
- Runs setup on creation, starts Homebridge on every startup

## Useful Commands

### Homebridge Management
```bash
# Check if Homebridge is running
ps aux | grep homebridge

# View live logs
tail -f ~/.homebridge/homebridge.log

# Restart Homebridge
pkill homebridge && .devcontainer/start-homebridge.sh

# Stop Homebridge (will restart on next codespace start)
pkill homebridge
```

### Plugin Development
```bash
# Build plugin
npm run build

# Auto-rebuild on changes (recommended)
npm run watch

# Relink plugin manually (if needed)
npm run relink
# or
ln -sf $(pwd) ~/.homebridge/node_modules/homebridge-carrier-infinity

# Run tests
npm test

# Lint code
npm run lint
```

### Accessing Homebridge Config UI
- **URL**: http://localhost:8581 (auto-forwarded in VS Code)
- **Default credentials**: admin/admin
- Click the "Ports" tab in VS Code to open directly

## Debugging Tips

1. **Check plugin is loaded**: Look for "Loaded plugin: homebridge-carrier-infinity" in logs
2. **Check platform is registered**: Look for "Loading platform: CarrierInfinity"
3. **API errors**: Check `~/.homebridge/homebridge.log` for debug output
4. **Config issues**: Homebridge will log validation errors on startup

### Common Issues

**Plugin not loading**:
```bash
# Verify plugin is linked
ls -la ~/.homebridge/node_modules/homebridge-carrier-infinity

# Rebuild and relink
npm run build && npm run relink
```

**Homebridge not starting**:
```bash
# Check logs for errors
tail -n 50 ~/.homebridge/homebridge.log

# Start manually
.devcontainer/start-homebridge.sh
```

## Environment Details

- **Homebridge config**: `~/.homebridge/config.json`
- **Homebridge storage**: `~/.homebridge/`
- **Plugin source**: `/workspaces/homebridge-carrier-infinity`
- **Node version**: 22.x
- **Homebridge version**: Latest
- **Config UI version**: Latest

## Persistence

The following persists across codespace rebuilds:
- `~/.homebridge/config.json` (your configuration)
- `~/.homebridge/` directory (accessories, cache, persist data)

The plugin code is always from your working directory, so changes are reflected immediately after rebuild + restart.

## VS Code Extensions

The following extensions are automatically installed:
- **Claude Code**: AI coding assistant
- **ESLint**: Linting and formatting
- **GitHub Copilot**: AI code completion
- **Jest**: Test runner integration
- **GitHub Actions**: Workflow management

## Advanced Usage

### Running Multiple Instances

To test different configurations:
```bash
# Stop auto-started instance
pkill homebridge

# Run with custom config
homebridge -D -U /path/to/custom/homebridge/directory
```

### Debugging with Breakpoints

1. Stop the auto-started Homebridge: `pkill homebridge`
2. Use VS Code's debugger to start Homebridge
3. Set breakpoints in your plugin code

### Manual Testing

```bash
# Test specific API endpoints
npm run build
node -e "require('./dist/api/rest_client.js')"
```
