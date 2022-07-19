import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from './accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import {
  InfinityEvolutionApiConnection,
  InfinityEvolutionLocations,
  InfinityEvolutionSystemModel,
} from './infinityApi';
import { EnvSensorAccessory } from './accessory_envsensor';
import { BaseAccessory } from './accessory_base';
import { ComfortActivityAccessory } from './accessory_comfort_activity';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly restored_accessories: Record<string, PlatformAccessory> = {};
  // this is used to track plugin accessories objects
  public readonly accessories: Record<string, BaseAccessory> = {};

  // carrier/bryant api
  public api_connection: InfinityEvolutionApiConnection;
  public systems: Record<string, InfinityEvolutionSystemModel> = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config.username || !config.password) {
      this.log.warn('Username and password do not appear to be set in config. This is not going to work.');
    }

    this.api_connection = new InfinityEvolutionApiConnection(config['username'], config['password'], this.log);
    this.api_connection.refreshToken().then();

    this.api.on('didFinishLaunching', () => {
      this.discoverSystems().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.restored_accessories[accessory.UUID] = accessory;
  }

  async discoverSystems(): Promise<void> {
    const systems = await new InfinityEvolutionLocations(this.api_connection).getSystems();
    for (const serialNumber of systems) {
      // Create system api object, and save for later reference
      const system = new InfinityEvolutionSystemModel(this.api_connection, serialNumber);
      this.systems[serialNumber] = system;

      // Add system based accessories
      const context_system = {serialNumber: system.serialNumber};
      this.log.info(`Discovered system ${JSON.stringify(context_system)}}`);
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
        this.log.info(`Discovered zone ${JSON.stringify(context_zone)}`);
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
        this.log.info(`[${accessory.context.name}] Removed (stale)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        delete this.restored_accessories[id];
      }
    }
  }
}
