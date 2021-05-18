# homebridge-carrier-infinity

Homebridge plugin for Carrier Infinity and Bryant Evolution thermostats.

This is a standalone plugin that talks directly to the Carrier/Bryant api. It does not require Infinitude/Infinitive.

# Create Carrier/Bryant Account 

If you have not done so already, you need to set up a Carrier or Bryant account, and link your thermostat to that account. You will use the username and password of this account for the configuration later.

Carrier: https://www.carrier.com/residential/en/us/access-your-thermostat/register.html
Bryant: https://www.bryant.com/en/us/current-owners/remote-login/bryant-thermostat/thermostat-registration/

# Behavior

You can choose how you want changes made via homekit to interact with the activity schedules of your thermostat using the `holdBehavior` setting.

* `activity`: Changes made via homekit will persist until the beginning of the next scheduled activity. Then scheduled activities will resume.
* `until_x`: Changes made via homekit will persist until the time `HH:MM`. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `for_x`: Changes made via homekit will persist for `HH:MM` from now. Then scheduled activities will resume. (Set time via `holdArgument` setting.)
* `forever`: Changes made via homekit will persist indefinitely. Scheduled activites will not resume until you remove the manual hold via the thermostat.

# Configuration

```
{
  "platforms": [
    {
      "platform": "CarrierInfinity",
      "username": "USERNAME",
      "password": "PASSWORD,
      "holdBehavior": "activity",
      "holdArgument": "HH:MM", // optional
    }
  ]
}
```

# Known Issues

* This plugin currently only supports Zone 1.

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
