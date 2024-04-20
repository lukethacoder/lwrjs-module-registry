# lwrjs-module-registry

⚡ An opinionated edit to the [`@lwrjs/module-registry`](https://www.npmjs.com/package/@lwrjs/module-registry) package.

## Fixes

### Windows Support

Several issues have been raised around Windows specific issues when running both LWR and `lightning-base-components.

- [Issue with using LWC base components <lightning-input> with the LWR Single Page Application - salesforce/lwc/issues/2993](https://github.com/salesforce/lwc/issues/2993)
- [Nested Module Imports are not resolved in LWC (but work on-platform) - salesforce/lwc/issues/3495](https://github.com/salesforce/lwc/issues/3495)
- [Build not working on Windows - trailheadapps/lwc-recipes-oss/issues/498](https://github.com/trailheadapps/lwc-recipes-oss/issues/498)

These issues are no longer issues 😊

### `index.(js|ts)` relative import

Minor bug where attempting to import a relative module from an `index.(js|ts)` file would result in an incorrect specifier. This should fix [Nested Module Imports are not resolved in LWC (but work on-platform) - salesforce/lwc/issues/3495](https://github.com/salesforce/lwc/issues/3495).
