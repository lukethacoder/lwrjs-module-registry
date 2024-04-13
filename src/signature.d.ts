import type { ModuleRegistry, ModuleId, RuntimeParams } from '@lwrjs/types'
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
export declare function getBundleSignature(
  moduleId: Required<Pick<ModuleId, 'specifier' | 'version'>>,
  registry: ModuleRegistry,
  runtimeParams: RuntimeParams,
  excludes?: string[]
): Promise<string>
