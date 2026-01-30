# Homebridge Development Scripts

## Quick Start

After the devcontainer is created, you'll have a fully configured Homebridge environment.

### 1. Configure your credentials

Edit `~/.homebridge/config.json` and add your Carrier Infinity credentials:

```bash
nano ~/.homebridge/config.json
```

Or copy the example config:

```bash
cp .devcontainer/config.json.example ~/.homebridge/config.json
# Then edit with your credentials
nano ~/.homebridge/config.json
```

### 2. Start Homebridge

```bash
homebridge
```

To run in debug mode:

```bash
homebridge -D
```

To run in the background:

```bash
homebridge &
```

### 3. Development Workflow

**Option A: Manual rebuild**
```bash
# Make your code changes, then:
npm run build
# Restart Homebridge to see changes
```

**Option B: Auto-rebuild (recommended)**

In one terminal:
```bash
npm run watch
```

In another terminal:
```bash
homebridge -D
```

When code changes, the watch command will rebuild. Then restart Homebridge to see changes.

## Useful Commands

### Build and link plugin
```bash
npm run build
```

### Run tests
```bash
npm test
```

### Lint code
```bash
npm run lint
```

### View Homebridge logs
If running in background:
```bash
tail -f ~/.homebridge/homebridge.log
```

### Access Homebridge UI
The Homebridge Config UI X is available at:
- Port 8581 (automatically forwarded in codespace)
- Default credentials: admin / admin (change after first login)

### Restart Homebridge
If running in background:
```bash
pkill homebridge
homebridge &
```

### Check if plugin is linked
```bash
ls -la ~/.homebridge/node_modules/homebridge-carrier-infinity
```

### Manually relink plugin (if needed)
```bash
ln -sf $(pwd) ~/.homebridge/node_modules/homebridge-carrier-infinity
```

## Debugging Tips

1. **Check plugin is loaded**: Look for "Loaded plugin: homebridge-carrier-infinity" in Homebridge output
2. **Check platform is registered**: Look for "Loading platform: CarrierInfinity"
3. **API errors**: Run with `-D` flag to see debug output
4. **Config issues**: Run `homebridge` and check for config validation errors

## Environment Info

- Homebridge config: `~/.homebridge/config.json`
- Homebridge storage: `~/.homebridge/`
- Plugin path: `/workspaces/homebridge-carrier-infinity`
- Node version: 22.x
