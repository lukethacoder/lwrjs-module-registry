import {
  LwrUnresolvableError,
  createSingleDiagnosticError,
  descriptions,
  logger,
} from '@lwrjs/diagnostics'
import {
  discoverInterchangeableModules,
  getCacheKeyFromJson,
  InflightTasks,
  LATEST_SIGNATURE,
  ModuleNameType,
  getGroupName,
  VERSION_NOT_PROVIDED,
  isExternalFileSpecifier,
} from '@lwrjs/shared-utils'
// dependencies @locker/compiler and rollup are in this package.json is to satisfy the shared-utils/compiler optional dependencies
import { convertToAmd } from '@lwrjs/shared-utils/compiler'
import { link } from './linker/linker.js'
import { getModuleRecord } from './module-record.js'
import amdLinkingStrategy from './linker/strategies/amd-strategy.js'
import esmLinkingStrategy from './linker/strategies/esm-strategy.js'
import { getBundleSignature } from './signature.js'

/**
 * Add windows support
 */
function fixSpecifier(specifier) {
  if (specifier.includes('#')) {
    return specifier.replaceAll('\\', '/')
  }
  return specifier
}

export class LwrModuleRegistry {
  constructor(context, globalConfig, registries) {
    this.providers = []
    this.moduleDefCache = new Map()
    this.moduleLinkedCache = new Map()
    this.inflightModuleDefinitions = new InflightTasks()
    this.name = 'lwr-module-registry'
    this.context = context
    this.globalConfig = globalConfig
    this.emitter = context.appEmitter
    if (registries) {
      this.providers = registries
    }
    if (globalConfig.environment?.default) {
      this.interchangeableModules = discoverInterchangeableModules(
        globalConfig.lwc.modules,
        globalConfig.lwc.interchangeableModulesMap
      )
    }
    context.appObserver.onModuleSourceChange(
      async ({ payload: moduleCompiled }) => {
        const id = moduleCompiled.id
        if (!this.moduleDefCache.has(id)) {
          logger.warn({
            label: `${this.name}`,
            message: `Unable to find match in moduleDefCache: ${id}`,
          })
        }
        this.moduleDefCache.delete(id)
        const linkedModules = this.moduleLinkedCache.get(id)
        if (linkedModules) {
          // refresh the module in the linkedCache
          this.moduleLinkedCache.delete(id)
          for (const [cacheId, module] of linkedModules) {
            linkedModules.delete(cacheId)
            // eslint-disable-next-line no-await-in-loop
            const moduleDefinition = await this.getLinkedModule(
              moduleCompiled,
              module.runtimeEnvironment,
              module.runtimeParams
            )
            // emit changes for each module definition already cached
            this.emitter.notifyModuleDefinitionChanged(moduleDefinition)
          }
        }
      }
    )
  }
  resolveModuleUriSync(moduleId, signature, runtimeEnvironment, runtimeParams) {
    const uri = esmLinkingStrategy(
      moduleId,
      runtimeEnvironment,
      runtimeParams,
      signature
    )
    return fixSpecifier(uri)
  }
  async resolveModuleUri(
    moduleId,
    runtimeEnvironment,
    runtimeParams,
    signature
  ) {
    // If we have a signature just sync resolve the uri
    if (signature !== undefined) {
      return this.resolveModuleUriSync(
        moduleId,
        signature,
        runtimeEnvironment,
        runtimeParams
      )
    }
    // Get the module entry to see if the src is provided by the provider.
    const moduleEntry = await this.getModuleEntry(moduleId, runtimeParams)
    if (moduleEntry.src) {
      return moduleEntry.src
    }
    // Else compute the URL from source
    const { bundle, format } = runtimeEnvironment
    if (bundle) {
      let bundleId
      if (format === 'amd') {
        // bundling groups is only supported in AMD for now
        const bundleGroups = this.globalConfig?.bundleConfig?.groups
        bundleId =
          bundleGroups && getGroupName(moduleId.specifier, bundleGroups)
      }
      return new Promise((resolve, reject) => {
        getBundleSignature(
          moduleId,
          this,
          runtimeParams,
          this.globalConfig?.bundleConfig?.exclude
        )
          .then((bundleSignature) =>
            resolve(
              esmLinkingStrategy(
                moduleId,
                runtimeEnvironment,
                runtimeParams,
                bundleSignature,
                bundleId
              )
            )
          )
          .catch(reject)
      })
      // For individual files we return a module URL
    } else {
      return new Promise((resolve, reject) => {
        this.getModule(moduleId, runtimeParams)
          .then((moduleDef) =>
            resolve(
              esmLinkingStrategy(
                moduleId,
                runtimeEnvironment,
                runtimeParams,
                // Simple rule for determining usage of LATEST v. fingerprinted URI.
                !bundle && format === 'esm'
                  ? LATEST_SIGNATURE
                  : moduleDef.ownHash
              )
            )
          )
          .catch(reject)
      })
    }
  }
  // -- Public API --------------------------------------------------------------------
  addModuleProviders(registries) {
    this.providers.push(...registries)
  }
  getConfig() {
    return {
      bundleConfig: this.globalConfig.bundleConfig || {},
    }
  }
  getModuleEntry(moduleId, runtimeParams) {
    return this.delegateGetModuleEntryOnServices(moduleId, runtimeParams)
  }
  async getModule(moduleId, runtimeParams) {
    let moduleEntry = await this.getModuleEntry(moduleId, runtimeParams)
    moduleEntry.specifier = fixSpecifier(moduleEntry.specifier)

    const cacheDisabled = process.env.NOCACHE === 'true'
    if (cacheDisabled === false && this.moduleDefCache.has(moduleEntry.id)) {
      // TODO add to profiling
      // logger.info('Module Cache Hit: %s', moduleEntry.id);
      return this.moduleDefCache.get(moduleEntry.id)
    }
    return this.inflightModuleDefinitions.execute(moduleEntry.id, async () => {
      const moduleDef = await this.createModuleDefinition(
        moduleId,
        runtimeParams
      )
      if (cacheDisabled === false) {
        this.moduleDefCache.set(moduleDef.id, moduleDef)
      }
      return moduleDef
    })
  }
  async createModuleDefinition(moduleId, runtimeParams) {
    const moduleCompiled = await this.delegateGetModuleOnProviders(
      moduleId,
      runtimeParams
    ) // provider source + hash

    const moduleRecord = await getModuleRecord(
      moduleCompiled,
      this,
      runtimeParams
    )
    return { ...moduleCompiled, moduleRecord }
  }
  async getLinkedModule(moduleId, runtimeEnvironment, runtimeParams) {
    const moduleEntry = await this.getModuleEntry(moduleId, runtimeParams)
    const id = moduleEntry.id
    // cache key pivots from the runtimeEnvironment
    const { format, compat, debug, minify, bundle } = runtimeEnvironment
    const locale = runtimeParams?.['locale']
    const environment = runtimeParams?.['environment']
    const {
      locker: { enabled: lockerEnabled },
    } = this.globalConfig
    const cacheDisabled = process.env.NOCACHE === 'true'
    if (cacheDisabled === false && this.moduleLinkedCache.has(id)) {
      const moduleLinks = this.moduleLinkedCache.get(id)
      const runtimeEnvKey = getCacheKeyFromJson({
        format,
        compat,
        debug,
        minify,
        bundle,
        lockerEnabled,
        locale,
        environment,
      })
      const moduleLinked = moduleLinks.get(runtimeEnvKey)
      if (moduleLinked) {
        return moduleLinked
      }
    }
    const moduleDef = await this.getModule(moduleId, runtimeParams)
    const moduleLinked = await this.createLinkedModuleDefinition(
      moduleDef,
      runtimeEnvironment,
      runtimeParams
    )
    // the bundler will convert the linked source to AMD when bundling is enabled
    if (
      format === 'amd' &&
      !bundle &&
      // Assume file based externals source are already in AMD
      !isExternalFileSpecifier(
        moduleLinked.specifier,
        this.getConfig().bundleConfig
      )
    ) {
      // convert the linkedSource to the transport AMD format
      moduleLinked.linkedSource = (
        await convertToAmd(moduleLinked.linkedSource, {
          id: moduleLinked.id,
        })
      ).code
    }
    // Add to cache
    if (cacheDisabled === false) {
      const linkedMap = this.moduleLinkedCache.get(id) || new Map()
      linkedMap.set(
        getCacheKeyFromJson({
          format,
          compat,
          debug,
          minify,
          bundle,
          lockerEnabled,
          locale,
          environment,
        }),
        moduleLinked
      )
      this.moduleLinkedCache.set(id, linkedMap)
    }
    return moduleLinked
  }
  async createLinkedModuleDefinition(
    moduleDef,
    runtimeEnvironment,
    runtimeParams
  ) {
    const { format } = runtimeEnvironment
    const { amdLoader, esmLoader } = this.globalConfig
    // TODO: compat transformation based on runtimeEnvironment.compat
    if (format === 'amd') {
      // Resolve the loader entry
      const loaderModuleEntry = await this.getModuleEntry(
        { specifier: amdLoader },
        runtimeParams
      )
      // transforms compiledModule into linkedModule (which means the imports may have changed)
      const {
        id,
        code: linkedSource,
        linkedModuleRecord,
      } = await link(
        this,
        moduleDef,
        amdLinkingStrategy,
        esmLinkingStrategy,
        runtimeEnvironment,
        runtimeParams,
        {
          amdLoaderModule: loaderModuleEntry,
        },
        this.interchangeableModules
      )
      // Filter out variable dynamic imports
      linkedModuleRecord.dynamicImports =
        linkedModuleRecord.dynamicImports?.filter(
          (imp) => imp.moduleNameType !== ModuleNameType.unresolved
        )
      return {
        ...moduleDef,
        id,
        linkedSource,
        linkedConfig: {
          minified: false,
        },
        linkedModuleRecord,
        runtimeEnvironment,
        runtimeParams,
      }
    } else {
      // resolve the loader entry if there are VARIABLE dynamic imports
      let loaderModuleEntry
      const dynamicImports = moduleDef.moduleRecord.dynamicImports
      if (moduleDef.moduleEntry.specifier !== esmLoader && dynamicImports) {
        // ONLY include the ESM loader if there are dynamic imports
        // AND this is not the ESM loader itself (it uses a variable dynamic import we DO NOT want to link)
        loaderModuleEntry = await this.getModuleEntry(
          { specifier: esmLoader },
          runtimeParams
        )
      }
      const {
        id,
        code: linkedSource,
        linkedModuleRecord,
      } = await link(
        this,
        moduleDef,
        amdLinkingStrategy,
        esmLinkingStrategy,
        runtimeEnvironment,
        runtimeParams,
        loaderModuleEntry && {
          esmLoaderModule: loaderModuleEntry,
        },
        this.interchangeableModules,
        this.globalConfig.bundleConfig
      )
      // Filter out variable dynamic imports
      linkedModuleRecord.dynamicImports =
        linkedModuleRecord.dynamicImports?.filter(
          (imp) => imp.moduleNameType !== ModuleNameType.unresolved
        )
      return {
        ...moduleDef,
        id,
        linkedSource,
        linkedConfig: {
          minified: false,
        },
        linkedModuleRecord,
        runtimeEnvironment,
        runtimeParams,
      }
    }
  }
  // -- Service delegation ----------------------------------------------
  async delegateGetModuleEntryOnServices(moduleId, runtimeParams) {
    for (const registry of this.providers) {
      moduleId.specifier = fixSpecifier(moduleId.specifier)
      // eslint-disable-next-line no-await-in-loop
      const result = await registry.getModuleEntry(moduleId, runtimeParams)
      if (result) {
        // If version is not set in the provider set it to 'version-not-provided' so we know it has been resolved.
        if (!result.version) {
          result.version = VERSION_NOT_PROVIDED
        }
        return result
      }
    }
    throw createSingleDiagnosticError(
      {
        description: descriptions.UNRESOLVABLE.MODULE_ENTRY(moduleId.specifier),
      },
      LwrUnresolvableError
    )
  }
  async delegateGetModuleOnProviders(moduleId, runtimeParams) {
    for (const registry of this.providers) {
      // eslint-disable-next-line no-await-in-loop
      const result = await registry.getModule(moduleId, runtimeParams)
      if (result) {
        // If version is not set in the provider set it to 'version-not-provided' so we know it has been resolved.
        if (!result.version) {
          result.version = VERSION_NOT_PROVIDED
        }
        if (!result.moduleEntry.version) {
          result.moduleEntry.version = VERSION_NOT_PROVIDED
        }
        return result
      }
    }
    throw createSingleDiagnosticError(
      {
        description: descriptions.UNRESOLVABLE.MODULE(moduleId.specifier),
      },
      LwrUnresolvableError
    )
  }
  getPublicApi() {
    return {
      getModuleEntry: this.getModuleEntry.bind(this),
      getModule: this.getModule.bind(this),
      getLinkedModule: this.getLinkedModule.bind(this),
      getConfig: this.getConfig.bind(this),
      resolveModuleUri: this.resolveModuleUri.bind(this),
    }
  }
}
