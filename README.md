<div align="center">

# Homebridge Carrier Infinity

[![verified by homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm version](https://badgen.net/npm/v/homebridge-carrier-infinity?icon=npm&label)](https://www.npmjs.com/package/homebridge-carrier-infinity)
[![npm downloads](https://badgen.net/npm/dt/homebridge-carrier-infinity?label=downloads)](https://www.npmjs.com/package/homebridge-carrier-infinity)

**Homebridge plugin for Carrier Infinity / Bryant Evolution / ICP Brands Ion thermostats.**
</div>

This is a standalone plugin for Homebridge that talks directly to the Infinity/Evolution/Ion api. It does not require Infinitude/Infinitive.

# Configuration

```
{
  "platforms": [
    {
      "platform": "CarrierInfinity",
      "username": "USERNAME",
      "password": "PASSWORD,
      "holdBehavior": "activity",
      "holdArgument": "HH:MM",
      "showFanControl": True,
      "showOutdoorTemperatureSensor": False
    }
  ]
}
```

## Username / Password

Use the credentials for your Infinity Touch / Evolution Connex / Ion Comfort account that is linked to your thermostat to configure this plugin.

If you have not already done so, you will first need to create an account and link it to your thermostat at:
* Carrier Infinity: https://www.myinfinitytouch.carrier.com/Account/Register
* Bryant Evolution: https://www.myevolutionconnex.bryant.com/Account/Register
* ICP Brands Ion (Airquest/Arcoaire/Comfortmaker/Day&Night/Heil/Keeprite/Tempstar): https://www.ioncomfort.com/Account/Register

## Hold Behavior / Hold Argument

You can choose how you want changes made via HomeKit to interact with the activity schedules of your thermostat using the `holdBehavior` setting.

* `activity`: Changes made via HomeKit will persist until the beginning of the next scheduled activity. Then scheduled activities will resume.
* `until_x`: Changes made via HomeKit will persist until the time `HH:MM`. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `for_x`: Changes made via HomeKit will persist for `HH:MM` from now. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `forever`: Changes made via HomeKit will persist indefinitely. Scheduled activites will not resume until you remove the manual hold via the thermostat.

## Fan Control

Enabling the `showFanControl` option will show a HomeKit fan accessory that can be used to control the fan mode of your system.

* Turning on the fan accessory puts the fan in 'Manual' mode with the selected speed (Low/Med/High).
* Turning off the fan accessory puts the fan in 'Auto' mode (when heat/cool/auto is active) or 'Off' mode (when system is off).
* Fan control changes made via HomeKit interact with the activity schedules of your thermostat based on the `holdBehavior` setting.

## Outdoor Temperature Sensor

Enabling the `showOutdoorTemperatureSensor` option will show a HomeKit sensor accessory that reports the outdoor air temperature seen by your system.

# Non-Issues

* It may take 1-2 minutes from the time you make a change via HomeKit until your thermostat sees the change. This is an unavoidable result of how the thermostats poll for updates.

# Disclaimer

This is beta software. I have only tested this on my single system / single zone Bryant Evolution system. (Though other people have used it successfully with multi-zone and multi-system setups.)

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
