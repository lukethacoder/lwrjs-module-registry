import crypto from 'crypto'
import { getFeatureFlags, getSpecifier } from '@lwrjs/shared-utils'
import { LWC_VERSION } from '@lwrjs/config'
const ENABLED_FINGERPRINTS = !getFeatureFlags().LEGACY_LOADER
const ENV_KEY = `LWC:${LWC_VERSION},FINGERPRINTS:${ENABLED_FINGERPRINTS}`
async function getRecursiveModuleHash(
  modules,
  registry,
  hash,
  runtimeParams,
  visitedDefinitions = new Set(),
  excludes = new Set()
) {
  if (!modules.length) {
    return
  }
  // Fetch all the definitions from the registry
  const definitions = await Promise.all(
    modules.map((module) => registry.getModule(module, runtimeParams))
  )
  const imports = new Map()
  for (const definition of definitions) {
    const { specifier, version, ownHash, moduleRecord } = definition
    // check if this definition was in the bundle excludes
    if (excludes.has(specifier)) {
      // add the version do not worry about crawling its dependents
      hash.update(`${specifier}@${version}@${ownHash}`)
      // add just the specifier to the visited list
      visitedDefinitions.add(specifier)
    } else {
      // include module in the bundle signature
      hash.update(ownHash)
      // track the module to ensure it is only processed once
      visitedDefinitions.add(getSpecifier(definition))
      // map imports to prevent processing duplicates
      moduleRecord.imports?.forEach((importReference) => {
        imports.set(getSpecifier(importReference), importReference)
      })
    }
  }
  // filter out bundle config exclusions and already visited dependencies
  const dependencies = Array.from(
    imports,
    ([_, dependency]) => dependency
  ).filter(
    (dependency) =>
      // exclusions are not versioned
      !visitedDefinitions.has(dependency.specifier) &&
      // already visited dependencies will be versioned
      !visitedDefinitions.has(getSpecifier(dependency))
  )
  if (dependencies.length) {
    return getRecursiveModuleHash(
      dependencies,
      registry,
      hash,
      runtimeParams,
      visitedDefinitions,
      excludes
    )
  }
}
/**
 * Generate a bundle signature
 *
 * Traverses the module graph from the specified root module to generate a
 *  signature. Modules that are marked for exclusion will be skipped. The
 *  bundle signature will be generated based on the environment
 *  keys(i.e. LWC version) and the ownHash of each module in the graph.
 *
 * @param moduleId - root module id
 * @param registry - module registry
 * @param exclude - bundle config exclusions
 * @returns a bungle signature
 */
export async function getBundleSignature(
  moduleId,
  registry,
  runtimeParams,
  excludes
) {
  const hash = crypto.createHash('sha1')
  // Add the environment key
  hash.update(ENV_KEY)
  // add bundle config exclusions to visited definitions to prevent including
  //  them in the bundle signature
  // Note: if the root module is an excluded module, it will be included in
  //  the signature
  await getRecursiveModuleHash(
    [moduleId],
    registry,
    hash,
    runtimeParams,
    new Set(),
    new Set(excludes)
  )
  return hash.digest('hex')
}
