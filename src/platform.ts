import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from './accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import {
  LocationsModelGraphQL,
  SystemModelGraphQL,
} from './api/models_graphql';
import { EnvSensorAccessory } from './accessory_envsensor';
import { BaseAccessory } from './accessory_base';
import { ComfortActivityAccessory } from './accessory_comfort_activity';
import { WholeHouseActivityAccessory } from './accessory_wholehouse_activity';
import { InfinityGraphQLClient } from './api/graphql_client';
import { getZoneDisplayName } from './helpers';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly restored_accessories: Record<string, PlatformAccessory> = {};
  // this is used to track plugin accessories objects
  public readonly accessories: Record<string, BaseAccessory> = {};

  // carrier/bryant api
  public infinity_client: InfinityGraphQLClient;
  public systems: Record<string, SystemModelGraphQL> = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config.username || !config.password) {
      this.log.error('Username and password do not appear to be set in config. This is not going to work.');
    }

    this.infinity_client = new InfinityGraphQLClient(config['username'], config['password'], this.log);
    this.infinity_client.refreshToken().then(); // Speed up init by starting login right away

    this.api.on('didFinishLaunching', () => {
      this.discoverSystems().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });

    // Note: GraphQL API does not require periodic activate() calls
    // Data is kept fresh via periodic fetch() calls in SystemModel
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.restored_accessories[accessory.UUID] = accessory;
  }

  async discoverSystems(): Promise<void> {
    // Login / wait for login token to appear
    await this.infinity_client.refreshToken();

    // Query for systems, start adding accessories
    let systems = await new LocationsModelGraphQL(this.infinity_client).getSystems();

    // Filter systems by serial number if configured (#212)
    const allowedSystems: string[] = this.config['systems'] || [];
    if (allowedSystems.length > 0) {
      const filtered = systems.filter(s => allowedSystems.includes(s));
      const skipped = systems.filter(s => !allowedSystems.includes(s));
      for (const s of skipped) {
        this.log.info(`[${s}] Skipping system (not in configured systems list)`);
      }
      systems = filtered;
    }

    const systemCount = systems.length;
    for (const serialNumber of systems) {
      // Create system api object, and save for later reference
      const system = new SystemModelGraphQL(this.infinity_client, serialNumber);
      this.systems[serialNumber] = system;

      // Add system based accessories
      const context_system = {serialNumber: system.serialNumber};
      const systemName = await system.profile.getName();
      system.log.info('Discovered system');
      // -> System Accessory: Outdoor Temp Sensor
      if (this.config['showOutdoorTemperatureSensor']) {
        const oatName = systemCount > 1
          ? `${systemName} Outdoor Temperature`
          : 'Outdoor Temperature';
        new OutdoorTemperatureAccessory(
          this,
          {...context_system, name: oatName},
        );
      }

      // -> System Accessory: Whole House Activity Switches
      if (this.config['showWholeHouseActivityControls']) {
        const wholeHouseName = systemCount > 1
          ? `${systemName} Whole House Activity`
          : 'Whole House Activity';
        new WholeHouseActivityAccessory(
          this,
          {
            ...context_system,
            name: wholeHouseName,
            holdBehavior: this.config['holdBehavior'],
            holdArgument: this.config['holdArgument'],
          },
        );
      }

      // Add system+zone based accessories
      const zones = await system.profile.getZones();
      for (const zone of zones) {  // 'of' makes sure we go through zone ids, not index
        const context_zone = {...context_system, zone: zone};
        system.log.debug(`Discovered zone ${context_zone.zone}`);
        const zoneName = await system.config.getZoneName(zone);
        const displayName = getZoneDisplayName(zoneName, systemName, zones.length, systemCount);
        // -> Zone Accessory: Thermostat
        new ThermostatAccessory(
          this,
          {
            ...context_zone,
            name: `${displayName} Thermostat`,
            holdBehavior: this.config['holdBehavior'],
            holdArgument: this.config['holdArgument'],
          },
        );
        // -> Zone Accessory: Env Sensor
        if (this.config['showIndoorHumiditySensors']) {
          new EnvSensorAccessory(
            this,
            {
              ...context_zone,
              name: `${displayName} Environmental Sensor`,
            },
          );
        }
        // -> Zone Accessory: Activity Select Switches
        if (this.config['showZoneComfortActivityControls']) {
          new ComfortActivityAccessory(
            this,
            {
              ...context_zone,
              name: `${displayName} Comfort Activity`,
              holdBehavior: this.config['holdBehavior'],
              holdArgument: this.config['holdArgument'],
            },
          );
        }
      }
    }

    // Clean up cached accessories that were not discovered from the api
    for (const id in this.restored_accessories) {
      if (!this.accessories[id]) {
        const accessory = this.restored_accessories[id];
        // TODO Use different logger
        this.log.info(`[${accessory.context.serialNumber}] [${accessory.context.name}] Removed (stale)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        delete this.restored_accessories[id];
      }
    }
  }
}
