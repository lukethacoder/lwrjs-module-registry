import type {
  AbstractModuleId,
  ModuleCompiled,
  ModuleEntry,
  ModuleProvider,
  ProviderContext,
} from '@lwrjs/types'
/**
 * Module provider to create module definitions based on the
 * externals in the bundle configuration
 */
export default class ExternalsModuleProvider implements ModuleProvider {
  name: string
  externals: Record<string, string>
  constructor(_config: never, context?: ProviderContext)
  getModuleEntry(moduleId: AbstractModuleId): Promise<ModuleEntry | undefined>
  getModule(moduleId: AbstractModuleId): Promise<ModuleCompiled | undefined>
}
