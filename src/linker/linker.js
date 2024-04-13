import { createStringBuilder } from '@lwrjs/shared-utils'
import {
  explodeSpecifier,
  getSpecifier,
  ModuleNameType,
} from '@lwrjs/shared-utils'
import { getBundleSignature } from '../signature.js'
/**
 * Link the compiledSource of a module source with the versioned ModuleRecord imports using a specific linking strategy
 * @param moduleDef
 * @param moduleRecord
 * @param strategy
 */
export async function link(
  moduleRegistry,
  moduleDef,
  versionStrategy,
  uriStrategy,
  runtimeEnvironment,
  runtimeParams,
  config,
  interchangeableModules,
  bundleConfig
) {
  const { specifier, version, compiledSource, moduleRecord } = moduleDef
  const { imports, dynamicImports, importMeta } = moduleRecord
  const { exclude, external } = bundleConfig || {}
  const codeStringBuilder = createStringBuilder(compiledSource)
  const amdLoaderModule = config?.amdLoaderModule
  const esmLoaderModule = config?.esmLoaderModule
  const strategy = amdLoaderModule ? versionStrategy : uriStrategy
  const id = strategy({ specifier, version }, runtimeEnvironment, runtimeParams)
  // transform each import using the provided linking strategy.
  let linkedImports = []
  let linkedDynamicImports = []
  if (imports && imports.length > 0) {
    linkedImports = await Promise.all(
      imports.map(async (importRef) => {
        if (importRef.interchangeable && runtimeParams?.environment) {
          // check for alternate implementation
          if (interchangeableModules?.has(importRef.specifier)) {
            const contextMap = interchangeableModules.get(importRef.specifier)
            const context = runtimeParams.environment
            if (contextMap?.has(context)) {
              const overrideSpecifier = contextMap.get(context)
              const moduleId = explodeSpecifier(overrideSpecifier)
              const overrideEntry = await moduleRegistry.getModuleEntry(
                moduleId,
                runtimeParams
              )
              if (overrideEntry) {
                importRef = {
                  ...importRef,
                  ...moduleId,
                  ...overrideEntry,
                }
              }
            }
          }
        }
        let signature
        // get signature for excluded modules when bundling esm
        if (
          runtimeEnvironment.bundle &&
          runtimeEnvironment.format === 'esm' &&
          exclude?.includes(importRef.specifier)
        ) {
          signature = await getBundleSignature(
            importRef,
            moduleRegistry,
            runtimeParams,
            exclude
          )
        }
        const { locations, sourceSpecifier } = importRef
        const link = strategy(
          importRef,
          runtimeEnvironment,
          runtimeParams,
          signature,
          undefined,
          external
        )
        // replace all locations of importee with the link
        const linkedLocations = locations.map((location) => {
          const { startColumn, endColumn } = location
          // rewrite the importee link
          codeStringBuilder.overwrite(startColumn, endColumn, link)
          return {
            startColumn,
            endColumn: endColumn + link.length,
          }
        })
        return {
          ...importRef,
          sourceSpecifier,
          specifier: link,
          locations: linkedLocations,
        }
      })
    )
  }
  if (dynamicImports && dynamicImports.length > 0) {
    let loaderSizeOffset = 0
    linkedDynamicImports = await Promise.all(
      dynamicImports.map(async (importRef) => {
        const { locations, sourceSpecifier } = importRef
        let signature
        const isStringLiteral =
          importRef.moduleNameType === ModuleNameType.string
        // get signature for dynamic imports when bundling esm
        if (
          isStringLiteral &&
          runtimeEnvironment.bundle &&
          runtimeEnvironment.format === 'esm'
        ) {
          signature = await getBundleSignature(
            importRef,
            moduleRegistry,
            runtimeParams,
            exclude
          )
        }
        // always link [literal] dynamic imports as versioned specifiers (AMD strategy)
        // linking them as URIs (ESM strategy) causes caching issues since they can contain stale signatures
        const link = isStringLiteral
          ? versionStrategy(
              importRef,
              runtimeEnvironment,
              runtimeParams,
              signature
            ) // dynamic import of a static string
          : importRef.specifier // variable dynamic imports: keep the variable name as-is
        // transform locations
        // replace all locations of importee with the link
        const linkedLocations = locations.map(
          ({ location, importLocation }) => {
            const { startColumn, endColumn } = location
            const { startColumn: importStart, endColumn: importEnd } =
              importLocation
            // rewrite the importee link if it is a static string
            if (isStringLiteral) {
              codeStringBuilder.overwrite(startColumn + 1, endColumn - 1, link)
            }
            if (amdLoaderModule || esmLoaderModule) {
              // replace the dynamic import with a configured loader
              // e.g. - await import('dynamic/module'); -> await load('dynamic/module');
              codeStringBuilder.overwrite(importStart, importEnd, 'load(')
              loaderSizeOffset = 2
              if (!isStringLiteral) {
                // add the importer specifier as the 2nd arg to load() for VARIABLE dynamic imports
                const importerSpecifier = getSpecifier({ specifier, version })
                codeStringBuilder.overwrite(
                  endColumn,
                  endColumn + 1,
                  `, '${importerSpecifier}')`
                )
                loaderSizeOffset = -1 * importerSpecifier.length - 2
              }
            }
            return {
              importLocation: {
                startColumn,
                endColumn: endColumn - loaderSizeOffset,
              },
              location: {
                startColumn,
                endColumn: endColumn + link.length - loaderSizeOffset,
              },
            }
          }
        )
        return {
          ...importRef,
          sourceSpecifier,
          specifier: link,
          locations: linkedLocations,
        }
      })
    )
  }
  // (optionally) add loader module import link if necessary
  let loaderImportOffset = 0
  if (
    dynamicImports &&
    dynamicImports.length > 0 &&
    (amdLoaderModule || esmLoaderModule)
  ) {
    // mutate ModuleEntry to ImportModuleRecord
    const { version, specifier } = amdLoaderModule || esmLoaderModule
    const { namespace, name } = explodeSpecifier(specifier)
    let signature
    if (esmLoaderModule && runtimeEnvironment.bundle) {
      // Ensure the ESM loader is signed, or there may be a clash between this import and an existing one
      signature = await getBundleSignature(
        { version, specifier },
        moduleRegistry,
        runtimeParams,
        exclude
      )
    }
    const loaderLink = strategy(
      { specifier, version },
      runtimeEnvironment,
      runtimeParams,
      signature
    )
    // import {load} from 'loader/loader'
    const loaderImport = `import { load } from "${loaderLink}";\n`
    loaderImportOffset = loaderImport.length
    codeStringBuilder.prepend(loaderImport)
    linkedImports.unshift({
      name,
      namespace,
      sourceSpecifier: specifier,
      specifier: loaderLink,
      version,
      locations: [
        {
          startColumn: 22,
          endColumn: 22 + loaderLink.length,
        },
      ],
    })
  }
  // replace "import.meta.env.SSR" statements with the "isServer" boolean from "lwr/environment"
  if (importMeta && importMeta.length > 0) {
    // Replace each "import.meta.env.SSR" statement with "isServer"
    importMeta.forEach(({ statement, location }) => {
      if (statement === 'import.meta.env.SSR') {
        codeStringBuilder.overwrite(
          location.startColumn,
          location.endColumn,
          'isServer'
        )
      }
    })
    const { specifier: envSpecifier, version: envVersion } =
      await moduleRegistry.getModuleEntry(
        { specifier: 'lwr/environment' },
        runtimeParams
      )
    const { namespace, name } = explodeSpecifier(envSpecifier)
    const envLink = strategy(
      { specifier: envSpecifier, version: envVersion },
      runtimeEnvironment,
      runtimeParams
    )
    const envImport = `import { isServer } from "${envLink}";\n`
    codeStringBuilder.prepend(envImport)
    linkedImports.unshift({
      name,
      namespace,
      sourceSpecifier: specifier,
      specifier: envLink,
      version,
      locations: [
        {
          startColumn: 26 + loaderImportOffset,
          endColumn: 26 + envLink.length + loaderImportOffset,
        },
      ],
    })
  }
  return {
    id,
    code: codeStringBuilder.toString(),
    linkedModuleRecord: {
      imports: linkedImports,
      dynamicImports: linkedDynamicImports,
    },
  }
}
