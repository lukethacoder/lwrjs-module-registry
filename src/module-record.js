import path from 'path'
import {
  explodeSpecifier,
  getImportMetadata,
  ModuleNameType,
} from '@lwrjs/shared-utils'

async function resolveRelativeImport(
  registry,
  moduleSpecifier,
  importeeEntry,
  version,
  location,
  runtimeParams
) {
  // Resolve any relative parts in the import specifier
  // eg: "c/app#app.html" => "c/app"
  // eg: "some/specifier#file" => "some/specifier"
  const [importeeSpecifier, importeePath] = importeeEntry.specifier.split('#')

  /**
   * Check if the requesting file is an index.(js|ts) file.
   *
   * Relative imports from index files is slightly different due to
   * the nature of JavaScript.
   */
  const isIndexJs =
    importeeEntry.entry.endsWith('index.js') ||
    importeeEntry.entry.endsWith('index.ts')

  if (importeePath) {
    /**
     * If the importer is ALSO a relative path, join it with the import string to get
     * a path relative to the package specifier.
     * eg: 'some/module#folder/file' imports './siblingFile' => 'some/module#folder/siblingFile'
     *
     * appending `.replace(/\\/g, '/')` magically adds windows issues
     */
    moduleSpecifier = `./${path
      .join(importeePath, '..', moduleSpecifier)
      .replace(/\\/g, '/')}`
  }

  // Maintain a # in the specifier for the relative import,
  //      so it can be identified later
  // eg: "c/app" & "./app.html" => "c/app#app.html"
  // eg: "some/specifier" & "./utils/file" => "some/specifier#utils/file"
  // TODO: This won't work for nested structures (ex. ../)
  let specifier = `${importeeSpecifier}#${moduleSpecifier.substr(2)}`

  // adds support for sibling imports from an `index.(js|ts)` file
  // don't forget windows support 😉
  if (isIndexJs && importeePath) {
    const indexBasedPath = path
      .join('./', importeePath, moduleSpecifier)
      .replace(/\\/g, '/')

    specifier = `${importeeSpecifier}#${indexBasedPath}`
  }

  const { namespace, name } = explodeSpecifier(specifier)
  const dependencyModuleEntry = await registry.getModuleEntry(
    {
      specifier,
      version,
      importer: importeeEntry.scope,
    },
    runtimeParams
  )
  return {
    namespace,
    name: name || specifier,
    sourceSpecifier: moduleSpecifier,
    specifier,
    version: dependencyModuleEntry.version,
    scope: dependencyModuleEntry.scope,
    locations: [location],
  }
}

async function resolveExternalImport(
  registry,
  moduleSpecifier,
  importeeEntry,
  location,
  runtimeParams
) {
  const { namespace, name, specifier } = explodeSpecifier(moduleSpecifier)
  const { entry, virtual } = importeeEntry
  const moduleEntryRoot = virtual ? undefined : path.dirname(entry)
  const dependencyModuleEntry = await registry.getModuleEntry(
    {
      specifier: moduleSpecifier,
      importer: moduleEntryRoot,
    },
    runtimeParams
  )
  return {
    namespace,
    name: name || specifier,
    scope: dependencyModuleEntry.scope,
    sourceSpecifier: moduleSpecifier,
    specifier: moduleSpecifier,
    version: dependencyModuleEntry.version,
    locations: [location],
    interchangeable: dependencyModuleEntry.interchangeable,
  }
}

export async function getModuleRecord(compiledModule, registry, runtimeParams) {
  const imports = []
  const dynamicImports = []
  const {
    compiledMetadata: defaultCompilerMetadata,
    moduleEntry,
    version,
  } = compiledModule
  const compiledMetadata = defaultCompilerMetadata || {}
  // Get imports metadata and merge with rest of compiledModule metadata
  const {
    imports: compiledModuleImports,
    dynamicImports: compiledModuleDynamicImports,
    importMeta,
  } = await getImportMetadata(compiledModule.compiledSource)
  Object.assign(compiledMetadata, {
    imports: compiledModuleImports,
    dynamicImports: compiledModuleDynamicImports,
  })
  // Process imports
  if (
    compiledMetadata &&
    compiledMetadata.imports &&
    compiledMetadata.imports.length > 0
  ) {
    const visitedImports = new Set() // Avoids multiple imports to the same specifier
    for (const { moduleSpecifier, location } of compiledMetadata.imports) {
      // Check for dupes first
      if (!visitedImports.has(moduleSpecifier)) {
        visitedImports.add(moduleSpecifier)

        if (moduleSpecifier.startsWith('.')) {
          // Import string is a relative path
          // eslint-disable-next-line no-await-in-loop
          const resolvedImport = await resolveRelativeImport(
            registry,
            moduleSpecifier,
            moduleEntry,
            version,
            location,
            runtimeParams
          )
          imports.push(resolvedImport)
        } else {
          // eslint-disable-next-line no-await-in-loop
          const resolvedImport = await resolveExternalImport(
            registry,
            moduleSpecifier,
            moduleEntry,
            location,
            runtimeParams
          )
          imports.push(resolvedImport)
        }
      } else {
        const importReference = imports.find(
          (i) => i.sourceSpecifier === moduleSpecifier
        )
        if (importReference) {
          importReference.locations.push(location)
        }
      }
    }
  }
  // Process dynamic imports
  if (
    compiledMetadata &&
    compiledMetadata.dynamicImports &&
    compiledMetadata.dynamicImports.length > 0
  ) {
    const visitedDynamicImports = new Set() // Avoids multiple imports to the same specifier
    for (const {
      moduleSpecifier,
      location,
      importLocation,
      moduleNameType,
    } of compiledMetadata.dynamicImports) {
      // Check for dupes first
      if (!visitedDynamicImports.has(moduleSpecifier)) {
        visitedDynamicImports.add(moduleSpecifier)
        if (moduleNameType === ModuleNameType.unresolved) {
          // mark variable dynamic imports
          dynamicImports.push({
            specifier: moduleSpecifier,
            sourceSpecifier: moduleSpecifier,
            version: '',
            name: moduleNameType,
            moduleNameType,
            locations: [
              {
                location,
                importLocation,
              },
            ],
          })
        } else if (moduleSpecifier.startsWith('.')) {
          // eslint-disable-next-line no-await-in-loop
          const { locations, ...resolvedImport } = await resolveRelativeImport(
            registry,
            moduleSpecifier,
            moduleEntry,
            version,
            location,
            runtimeParams
          )
          dynamicImports.push({
            ...resolvedImport,
            moduleNameType: ModuleNameType.string,
            locations: [
              {
                location: locations[0],
                importLocation,
              },
            ],
          })
        } else {
          // It's addressing a separate module
          // eslint-disable-next-line no-await-in-loop
          const { locations, ...resolvedImport } = await resolveExternalImport(
            registry,
            moduleSpecifier,
            moduleEntry,
            location,
            runtimeParams
          )
          dynamicImports.push({
            ...resolvedImport,
            moduleNameType: ModuleNameType.string,
            locations: [
              {
                location: locations[0],
                importLocation,
              },
            ],
          })
        }
      } else {
        const importReference = dynamicImports.find(
          (i) => i.sourceSpecifier === moduleSpecifier
        )
        if (importReference) {
          importReference.locations.push({ location, importLocation })
        }
      }
    }
  }

  return {
    imports,
    dynamicImports,
    importMeta,
  }
}
//# sourceMappingURL=module-record.js.map
