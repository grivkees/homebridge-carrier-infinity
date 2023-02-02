import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from './accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import {
  LocationsModel,
  SystemModel,
  SystemModelSettings,
} from './api/models';
import { EnvSensorAccessory } from './accessory_envsensor';
import { BaseAccessory } from './accessory_base';
import { ComfortActivityAccessory } from './accessory_comfort_activity';
import { InfinityRestClient } from './api/rest_client';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly restored_accessories: Record<string, PlatformAccessory> = {};
  // this is used to track plugin accessories objects
  public readonly accessories: Record<string, BaseAccessory> = {};

  // carrier/bryant api
  public infinity_client: InfinityRestClient;
  public systems: Record<string, SystemModel> = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config.username || !config.password) {
      this.log.error('Username and password do not appear to be set in config. This is not going to work.');
    }

    this.infinity_client = new InfinityRestClient(config['username'], config['password'], this.log);
    this.infinity_client.forceRefreshToken().then().catch(error => {
      this.log.error('Login failed: ' + error.message);
    });

    this.api.on('didFinishLaunching', () => {
      this.discoverSystems().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });

    // Periodically ping the carrier api to keep it in sync with the thermostat.
    // This does not keep HomeKit in sync, however, since the plugin does not
    // know how to push changes to HK yet.
    // TODO: try to move this into the api class when we have event based
    setInterval(() => {
      this.infinity_client.activate();
    }, 30 * 60 * 1000); // every 30 min
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.restored_accessories[accessory.UUID] = accessory;
  }

  async discoverSystems(): Promise<void> {
    const systems = await new LocationsModel(this.infinity_client).getSystems();
    for (const serialNumber of systems) {
      // Create system api object, and save for later reference
      const system_settings = new SystemModelSettings(this.config);
      const system = new SystemModel(this.infinity_client, serialNumber, system_settings);
      this.systems[serialNumber] = system;

      // Add system based accessories
      const context_system = {serialNumber: system.serialNumber};
      system.log.info('Discovered system');
      // -> System Accessory: Outdoor Temp Sensor
      if (this.config['showOutdoorTemperatureSensor']) {
        new OutdoorTemperatureAccessory(
          this,
          {...context_system, name: 'Outdoor Temperature'},
        );
      }

      // Add system+zone based accessories
      const zones = await system.profile.getZones();
      for (const zone of zones) {  // 'of' makes sure we go through zone ids, not index
        const context_zone = {...context_system, zone: zone};
        system.log.debug(`Discovered zone ${context_zone.zone}`);
        // -> Zone Accessory: Thermostat
        new ThermostatAccessory(
          this,
          {
            ...context_zone,
            name: `${await system.config.getZoneName(zone)} Thermostat`,
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
              name: `${await system.config.getZoneName(zone)} Environmental Sensor`,
            },
          );
        }
        // -> Zone Accessory: Activity Select Switches
        if (this.config['showZoneComfortActivityControls']) {
          new ComfortActivityAccessory(
            this,
            {
              ...context_zone,
              name: `${await system.config.getZoneName(zone)} Comfort Activity`,
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
