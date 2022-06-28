import { API, Categories, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from '././accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import {
  InfinityEvolutionApiConnection,
  InfinityEvolutionLocations,
  InfinityEvolutionSystemModel,
} from './infinityApi';
import { EnvSensorAccessory } from './accessory_envsensor';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

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
    this.accessories.push(accessory);
  }

  async discoverSystems(): Promise<void> {
    const found_accessories: PlatformAccessory[] = [];

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
        const accessory = new OutdoorTemperatureAccessory(
          this,
          {...context_system, name: 'Outdoor Temperature'},
        );
        found_accessories.push(accessory.accessory);
      }

      // Add system+zone based accessories
      const zones = await system.profile.getZones();
      for (const zone of zones) {  // 'of' makes sure we go through zone ids, not index
        const context_zone = {...context_system, zone: zone};
        this.log.info(`Discovered zone ${JSON.stringify(context_zone)}`);
        // -> Zone Accessory: Thermostat
        const accessory = new ThermostatAccessory(
          this,
          {
            ...context_zone,
            name: await system.config.getZoneName(zone),
            holdBehavior: this.config['holdBehavior'],
            holdArgument: this.config['holdArgument'],
          },
        );
        found_accessories.push(accessory.accessory);
        // -> Zone Accessory: Env Sensor
        if (this.config['showIndoorHumiditySensors']) {
          const accessory = new EnvSensorAccessory(
            this,
            {
              ...context_zone,
              name: `${await system.config.getZoneName(zone)} Environmental Sensor`,
            },
          );
          found_accessories.push(accessory.accessory);
        }
      }
    }

    const missing_accessories = this.accessories.filter(
      accessory => !found_accessories.includes(accessory),
    );
    missing_accessories.forEach(accessory => {
      this.log.info(
        `Removing old device "${accessory.displayName}" (serial:${accessory.context.serialNumber} zone:${accessory.context.zone})`,
      );
    });
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, missing_accessories);
  }
}
