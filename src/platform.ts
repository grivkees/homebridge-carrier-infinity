import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { InfinityEvolutionPlatformAccessory } from './platformAccessory';
import { InfinityEvolutionOpenApi } from './infinityApi';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // carrier/bryant api
  public InfinityEvolutionOpenApi: InfinityEvolutionOpenApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (
      typeof config['username'] === 'string' &&
      typeof config['password'] === 'string'
    ) {
      this.InfinityEvolutionOpenApi = new InfinityEvolutionOpenApi(config['username'], config['password']);
      this.InfinityEvolutionOpenApi.refreshToken()
        .then(response => {
          this.log.info(`Login success. Got token ${response}`);
        })
        .catch(error => {
          this.log.error('Login error: ', error.message);
        });
    } else {
      throw new Error('Login credentials not set.');
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      // TODO: remove accessories no longer in remote system
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.InfinityEvolutionOpenApi.getSystems()
      .then(systems => {
        for (const name in systems) {
          const serialNumber = systems[name];
          const uuid = this.api.hap.uuid.generate(serialNumber);
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
          if (existingAccessory) {
            new InfinityEvolutionPlatformAccessory(this, existingAccessory);
            // Pick up any name changes
            existingAccessory.context.displayName = name;
            // create accessory
            this.api.updatePlatformAccessories([existingAccessory]);
          } else {
            this.log.info('Adding new accessory:', name);
            const accessory = new this.api.platformAccessory(name, uuid);
            accessory.context.displayName = name;
            accessory.context.serialNumber = serialNumber;
            // create accessory and register
            new InfinityEvolutionPlatformAccessory(this, accessory);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        }
      })
      .catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });

  }
}
