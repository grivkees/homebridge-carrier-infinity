import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { InfinityEvolutionPlatformAccessory } from './platformAccessory';
import { InfinityEvolutionApi, InfinityEvolutionLocations, InfinityEvolutionSystemProfile } from './infinityApi';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // carrier/bryant api
  public InfinityEvolutionApi: InfinityEvolutionApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (
      typeof config['username'] === 'string' &&
      typeof config['password'] === 'string'
    ) {
      this.InfinityEvolutionApi = new InfinityEvolutionApi(config['username'], config['password']);
      this.InfinityEvolutionApi.refreshToken()
        .then(() => {
          this.log.info('Login success.');
        })
        .catch(error => {
          this.log.error('Login error: ', error.message);
          throw error;
        });
    } else {
      throw new Error('Login credentials not set.');
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      // TODO: remove accessories no longer in remote system
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  registerAccessory(serialNumber: string, zone: string): void {
    const uuid = this.api.hap.uuid.generate(String(serialNumber));
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      new InfinityEvolutionPlatformAccessory(this, existingAccessory);
      this.api.updatePlatformAccessories([existingAccessory]);
    } else {
      const name = `${serialNumber}:${zone}`;
      this.log.info('Adding new accessory:', name);
      const accessory = new this.api.platformAccessory(name, uuid);
      accessory.context.serialNumber = serialNumber;
      accessory.context.zone = zone;
      new InfinityEvolutionPlatformAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  discoverDevices(): void {
    new InfinityEvolutionLocations(this.InfinityEvolutionApi).getSystems()
      .then(systems => {
        for (const name in systems) {
          const serialNumber = systems[name];
          new InfinityEvolutionSystemProfile(
            this.InfinityEvolutionApi,
            serialNumber,
          ).getZones().then(zones => {
            for (const zone in zones) {
              this.registerAccessory(serialNumber, zone);
            }
          });
        }
      })
      .catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });

  }
}
