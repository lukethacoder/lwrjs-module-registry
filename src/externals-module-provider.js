import {
  PROTOCOL_FILE,
  VERSION_NOT_PROVIDED,
  explodeSpecifier,
  getSpecifier,
  hashContent,
} from '@lwrjs/shared-utils'
import fs from 'fs-extra'
import url from 'url'
/**
 * Module provider to create module definitions based on the
 * externals in the bundle configuration
 */
export default class ExternalsModuleProvider {
  constructor(_config, context) {
    this.name = 'externals-module-provider'
    this.externals = context?.config.bundleConfig?.external || {}
  }
  async getModuleEntry(moduleId) {
    const { specifier, version } = moduleId
    // TODO We should upgrade the compiler to ES2022 and use Object.hasOwn()
    if (
      specifier &&
      Object.prototype.hasOwnProperty.call(this.externals, specifier)
    ) {
      const entry = this.externals[specifier]
      const resolvedVersion = version || VERSION_NOT_PROVIDED
      return {
        virtual: true,
        id: getSpecifier({ ...moduleId, version: resolvedVersion }),
        entry,
        specifier: specifier,
        version: resolvedVersion,
      }
    }
    // proceed to next provider
    return undefined
  }
  async getModule(moduleId) {
    const moduleEntry = await this.getModuleEntry(moduleId)
    if (moduleEntry) {
      let originalSource = ''
      let ownHash = ''
      const srcUri = this.externals[moduleEntry.specifier]
      if (srcUri && srcUri.startsWith(PROTOCOL_FILE)) {
        const srcPath = url.fileURLToPath(srcUri)
        originalSource = (await fs.readFile(srcPath)).toString()
        ownHash = hashContent(originalSource)
      }
      const { name, namespace } = explodeSpecifier(moduleEntry.specifier)
      return {
        id: moduleEntry.id,
        moduleEntry,
        specifier: moduleEntry.specifier,
        name,
        namespace,
        version: moduleEntry.version,
        compiledSource: originalSource,
        ownHash,
        originalSource,
      }
    }
    // proceed to next provider
    return undefined
  }
}
