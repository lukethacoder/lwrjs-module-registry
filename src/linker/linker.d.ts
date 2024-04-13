import type {
  ModuleRecord,
  ModuleEntry,
  ModuleDefinition,
  RuntimeEnvironment,
  Specifier,
  RuntimeParams,
  InterchangeableModuleMap,
  BundleConfig,
} from '@lwrjs/types'
import type { LwrModuleRegistry } from '../index.js'
export interface LinkingStrategy {
  (
    moduleId: {
      specifier: Specifier
      version: string
    },
    runtimeEnvironment: RuntimeEnvironment,
    runtimeParams?: RuntimeParams,
    signature?: string,
    bundleId?: string,
    external?: Record<string, string>
  ): string
}
interface AmdLinkerConfig {
  amdLoaderModule: ModuleEntry
}
interface EsmLinkerConfig {
  esmLoaderModule: ModuleEntry
}
export type LinkerConfig = AmdLinkerConfig | EsmLinkerConfig
export interface ModuleLinkResult {
  id: string
  code: string
  linkedModuleRecord: ModuleRecord
}
/**
 * Link the compiledSource of a module source with the versioned ModuleRecord imports using a specific linking strategy
 * @param moduleDef
 * @param moduleRecord
 * @param strategy
 */
export declare function link(
  moduleRegistry: LwrModuleRegistry,
  moduleDef: ModuleDefinition,
  versionStrategy: LinkingStrategy,
  uriStrategy: LinkingStrategy,
  runtimeEnvironment: RuntimeEnvironment,
  runtimeParams: RuntimeParams,
  config?: LinkerConfig,
  interchangeableModules?: InterchangeableModuleMap,
  bundleConfig?: BundleConfig
): Promise<ModuleLinkResult>
export {}
