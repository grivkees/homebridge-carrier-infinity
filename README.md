<div align="center">

# Homebridge Carrier Infinity

[![verified by homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm version](https://img.shields.io/npm/v/homebridge-carrier-infinity?logoColor=white)](https://www.npmjs.com/package/homebridge-carrier-infinity)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-carrier-infinity)](https://www.npmjs.com/package/homebridge-carrier-infinity)
[![License](https://img.shields.io/github/license/grivkees/homebridge-carrier-infinity)](https://github.com/grivkees/homebridge-carrier-infinity/blob/master/LICENSE)

**Homebridge plugin for Carrier Infinity / Bryant Evolution / ICP Brands Ion thermostats.**
</div>

# Supported Systems

This is a standalone plugin for Homebridge that talks directly to the Infinity/Evolution/Ion api. It should support these similar systems:
* [Carrier Infinity](https://www.myinfinitytouch.carrier.com/Account/Register)</a>
* [Bryant Evolution](https://www.myevolutionconnex.bryant.com/Account/Register)</a>
* [ICP Brands Ion](https://www.ioncomfort.com/Account/Register) (including Airquest, Arcoaire, Comfortmaker, Day&Night, Heil, Keeprite, Tempstar)

# Getting Started

1. Install Homebridge ([wiki: new to homebridge](https://github.com/grivkees/homebridge-carrier-infinity/wiki/New-To-Homebridge))
2. Search for and install "Homebridge Carrier Infinity" from the plugin screen of [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x#plugin-screen)
3. Open the plugin settings and follow the confguration instructions shown ([wiki: configuration](https://github.com/grivkees/homebridge-carrier-infinity/wiki/Configuration))
4. Restart Homebridge for settings to take effect

# Notes

* It may take 1-2 minutes from the time you make a change via HomeKit until your thermostat sees the change. This is an unavoidable result of how the thermostats poll for updates.
* This plugin *does not* require Infinitude/Infinitive.

# Development

[![GitHub Workflow Status (branch)](https://img.shields.io/github/workflow/status/grivkees/homebridge-carrier-infinity/Build,%20Lint,%20Test/master?logo=github-actions&logoColor=white)](https://github.com/grivkees/homebridge-carrier-infinity/actions/workflows/build.yml)
[![npm (tag)](https://img.shields.io/npm/v/homebridge-carrier-infinity/next)](https://www.npmjs.com/package/homebridge-carrier-infinity/v/next)