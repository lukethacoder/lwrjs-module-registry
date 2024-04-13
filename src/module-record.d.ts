import type {
  ModuleCompiled,
  ModuleRecord,
  ModuleRegistry,
  RuntimeParams,
} from '@lwrjs/types'
export declare function getModuleRecord(
  compiledModule: ModuleCompiled,
  registry: ModuleRegistry,
  runtimeParams: RuntimeParams
): Promise<ModuleRecord>
