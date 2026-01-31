# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homebridge plugin for Carrier Infinity / Bryant Evolution / ICP Brands Ion thermostats. It communicates directly with the Carrier/Bryant cloud API (not requiring Infinitude/Infinitive) and exposes thermostat controls, sensors, and activities to HomeKit.

## Development Commands

```bash
# Build the plugin
npm run build

# Lint code (must have 0 warnings)
npm run lint

# Run tests
npm test

# Watch mode (auto-rebuild and relink to local Homebridge)
npm run watch

# Relink plugin to local Homebridge instance
npm run relink

# Generate TypeScript interfaces from XML test data
npm run xml2ts
```

## Codespace/Devcontainer Development Environment

This repository includes a complete devcontainer configuration that automatically sets up a Homebridge development environment.

### Automatic Setup

When the codespace is created, the setup script (`.devcontainer/setup-homebridge.sh`) automatically:
- Installs Homebridge, Homebridge Config UI X, and pm2 globally
- Creates `~/.homebridge/` directory structure
- Copies `.devcontainer/config.json.example` to `~/.homebridge/config.json` (Fahrenheit display)
- Copies `.devcontainer/.uix-hb-service-homebridge-startup.json.example` (debug mode enabled)
- Installs project dependencies
- Builds the plugin
- Symlinks the plugin to `~/.homebridge/node_modules/`

### Getting Started in Codespace

1. **Homebridge starts automatically**: On codespace startup, Homebridge and Config UI start automatically via `hb-service` managed by `pm2`
   - pm2 keeps the service running persistently (auto-restart on crashes)
   - Access Config UI at http://localhost:8581 (port auto-forwarded)
   - Default credentials: admin/admin
   - Logs: `pm2 logs homebridge` or `~/.homebridge/homebridge.log`

2. **Configure credentials**: Edit `~/.homebridge/config.json` with your Carrier Infinity username/password
   - Config is pre-created from `.devcontainer/config.json.example` - just update credentials
   - Can also edit via Config UI at http://localhost:8581

3. **Development workflow**:
   - Run `npm run watch` (auto-rebuild on changes)
   - Restart Homebridge to pick up plugin changes: `pm2 restart homebridge`

For complete development environment documentation, commands, and debugging tips, see [.devcontainer/README.md](.devcontainer/README.md).

### TypeScript Configuration
- Target: ES2018 (Node 10+)
- Output: `dist/` directory
- Uses experimental decorators (required for memoization and retry decorators)
- `noImplicitAny: false` is set in tsconfig

## Architecture Overview

### Plugin Entry Point
The plugin registers itself in [src/index.ts](src/index.ts) and implements the Homebridge `DynamicPlatformPlugin` interface via `CarrierInfinityHomebridgePlatform` in [src/platform.ts](src/platform.ts).

### Core Components

#### 1. Platform ([src/platform.ts](src/platform.ts))
- Entry point that discovers systems and zones after Homebridge launches
- Maintains `infinity_client` (REST API client) and `systems` (indexed by serial number)
- Periodically activates the API every 30 minutes to maintain connection
- Creates accessories based on config options (outdoor temp sensor, humidity sensors, etc.)

#### 2. API Layer ([src/api/](src/api/))
- **InfinityRestClient** ([src/api/rest_client.ts](src/api/rest_client.ts)): OAuth-authenticated Axios client
  - Handles authentication with username/password
  - Automatic OAuth header injection via interceptor
  - Token refresh with 24hr memoization
  - Activation endpoint called every minute (with memoization)

- **Models** ([src/api/models.ts](src/api/models.ts)): BaseModel and specific models (LocationsModel, SystemModel, etc.)
  - `BaseModel` provides fetch/push pattern with mutex locking to prevent race conditions
  - Hash-based change detection (only pushes if data actually changed)
  - 10-second memoization on fetch operations
  - XML parsing via xml2js
  - Models include: `LocationsModel`, `SystemModel` with nested `ConfigModel`, `ProfileModel`, `StatusModel`

- **Interface Files**: TypeScript interfaces auto-generated from XML samples in `testdata/` using the `xml2ts` script
  - [src/api/interface_config.ts](src/api/interface_config.ts)
  - [src/api/interface_profile.ts](src/api/interface_profile.ts)
  - [src/api/interface_status.ts](src/api/interface_status.ts)
  - [src/api/interface_locations.ts](src/api/interface_locations.ts)

#### 3. Accessories ([src/accessory_*.ts](src/))
All accessories extend `BaseAccessory` ([src/accessory_base.ts](src/accessory_base.ts)):
- Handles UUID generation and caching
- Uses `useService()` helper to find or create HAP services
- Each accessory type:
  - **ThermostatAccessory**: Main thermostat control
  - **OutdoorTemperatureAccessory**: Outdoor temp sensor (optional)
  - **EnvSensorAccessory**: Indoor humidity sensor (optional)
  - **ComfortActivityAccessory**: Touch-n-Go activity switches (optional)

#### 4. Characteristics ([src/characteristics_*.ts](src/))
The plugin uses a wrapper pattern to bind HomeKit characteristics to API data:
- **CharacteristicWrapper** ([src/characteristics_base.ts](src/characteristics_base.ts)): Abstract base class
  - Each wrapper handles one characteristic (or multiple via `MultiWrapper`)
  - Defines `get` and `set` async handlers
  - `wrap()` method attaches handlers to HAP Service
  - Automatic debouncing/batching of set operations
  - Subscription-based push updates when API data changes

- Specific wrappers:
  - `characteristics_ac.ts`: Heating/cooling characteristics
  - `characteristics_fan.ts`: Fan mode and state
  - `characteristics_humidity.ts`: Humidity sensing
  - `characteristics_filter.ts`: Filter status

### Key Patterns

#### OAuth Authentication
The API uses OAuth 1.0 with custom headers. See [src/api/oauth.ts](src/api/oauth.ts) for signature generation and [src/settings.ts](src/settings.ts) for consumer key/secret.

#### Memoization & Retry Decorators
- `@MemoizeExpiring(milliseconds)`: Caches method results for specified duration
- `@Retryable()`: Automatic retry with exponential backoff for network failures
- Both decorators from `typescript-memoize` and `typescript-retry-decorator` packages

#### Mutex Locking
API models use `async-mutex` to prevent concurrent fetch/push operations that could cause race conditions. The pattern:
```typescript
await tryAcquire(this.write_lock).runExclusive(async () => {
  // critical section
});
```

#### Data Flow
1. **Read**: Characteristic getter → Model.fetch() → API GET → XML parse → return value
2. **Write**: Characteristic setter → batch changes → Model.push() → XML build → API PUT
3. **Updates**: Periodic polling + hash comparison triggers characteristic updates via subscription pattern

#### Hold Behavior
The plugin supports multiple thermostat hold modes (forever, until next activity, for X hours, until time X) configured via `holdBehavior` and `holdArgument` in config.

## Testing

- Test framework: Jest with ts-jest preset
- Test data: XML samples in `testdata/` directory
- Current tests: `src/helpers.spec.ts`
- Run: `npm test`

## Code Style (ESLint)

- Single quotes, 2-space indent
- Max line length: 140 characters
- Spellcheck plugin with custom dictionary for domain terms (carrier, bryant, oauth, etc.)
- See [.eslintrc](.eslintrc) for full rules
- Must pass with 0 warnings for builds

## Semantic Release

- Uses conventional commits (commitizen configured)
- Branches: `master` (next channel), `beta` (prerelease)
- Automated via GitHub Actions

## Important Notes

- The API expects `activate()` calls regularly (~1 min), though more frequent doesn't help
- Changes from HomeKit can take 1-2 minutes to reach the physical thermostat due to polling architecture
- Node version requirement: >= 18
- Homebridge version: >= 1.2 or ^2.0.0-beta.0
