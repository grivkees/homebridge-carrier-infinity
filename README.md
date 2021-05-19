# homebridge-carrier-infinity

**Homebridge plugin for Carrier Infinity / Bryant Evolution / ICP Brands Ion thermostats.**

This is a standalone plugin that talks directly to the Infinity/Evolution/Ion api. It does not require Infinitude/Infinitive.

# Register Your System

If you have not done so already, you need to set up a Infinity/Evolution/Ion account linked to your thermostat. You will need these credentials to configure this plugin.

* Carrier Infinity: https://www.myinfinitytouch.carrier.com/Account/Register
* Bryant Evolution: https://www.myevolutionconnex.bryant.com/Account/Register
* ICP Brands Ion (Airquest/Arcoaire/Comfortmaker/Day&Night/Heil/Keeprite/Tempstar): https://www.ioncomfort.com/Account/Register

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
    }
  ]
}
```

## Hold Behavior

You can choose how you want changes made via homekit to interact with the activity schedules of your thermostat using the `holdBehavior` setting.

* `activity`: Changes made via homekit will persist until the beginning of the next scheduled activity. Then scheduled activities will resume.
* `until_x`: Changes made via homekit will persist until the time `HH:MM`. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `for_x`: Changes made via homekit will persist for `HH:MM` from now. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `forever`: Changes made via homekit will persist indefinitely. Scheduled activites will not resume until you remove the manual hold via the thermostat.

# Known Issues

* This plugin currently only supports Zone 1. Zones 2+ will not show up.
* Removing a hold via the thermostat or Carrier/Bryant app may take several minutes to show up in homekit.

# Non-Issues

* It may take 1-2 minutes from the time you make a change via homekit until your thermostat sees the change. This is a result of how the termostats poll for updates.

# Disclaimer

This is beta software. I have only tested this on my single system / single zone Bryant Evolution system.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
