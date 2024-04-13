import type {
  AbstractModuleId,
  LinkedModuleDefinition,
  LwrAppEmitter,
  LwrAppObserver,
  ModuleDefinition,
  ModuleEntry,
  ModuleId,
  ModuleProvider,
  ModuleRegistry,
  ModuleRegistryConfig,
  NormalizedLwrGlobalConfig,
  PublicModuleRegistry,
  RuntimeEnvironment,
  RuntimeParams,
} from '@lwrjs/types'
interface RegistryContext {
  appObserver: LwrAppObserver
  appEmitter: LwrAppEmitter
  runtimeEnvironment: RuntimeEnvironment
}
export declare class LwrModuleRegistry implements ModuleRegistry {
  name: string
  providers: ModuleProvider[]
  moduleDefCache: Map<string, ModuleDefinition>
  moduleLinkedCache: Map<string, Map<string, LinkedModuleDefinition>>
  context: RegistryContext
  emitter: LwrAppEmitter
  globalConfig: NormalizedLwrGlobalConfig
  private interchangeableModules?
  private inflightModuleDefinitions
  constructor(
    context: RegistryContext,
    globalConfig: NormalizedLwrGlobalConfig,
    registries?: ModuleProvider[]
  )
  resolveModuleUriSync<
    R extends RuntimeEnvironment,
    S extends string | undefined
  >(
    moduleId: Required<Pick<ModuleId, 'specifier' | 'version'>>,
    signature: S,
    runtimeEnvironment: R,
    runtimeParams: RuntimeParams
  ): string
  resolveModuleUri<R extends RuntimeEnvironment, S extends string | undefined>(
    moduleId: Required<Pick<ModuleId, 'specifier' | 'version'>>,
    runtimeEnvironment: R,
    runtimeParams: RuntimeParams,
    signature?: S
  ): Promise<string>
  addModuleProviders(registries: ModuleProvider[]): void
  getConfig(): ModuleRegistryConfig
  getModuleEntry<T extends AbstractModuleId>(
    moduleId: T,
    runtimeParams: RuntimeParams
  ): Promise<ModuleEntry>
  getModule<T extends AbstractModuleId>(
    moduleId: T,
    runtimeParams: RuntimeParams
  ): Promise<ModuleDefinition>
  private createModuleDefinition
  getLinkedModule<T extends AbstractModuleId>(
    moduleId: T,
    runtimeEnvironment: RuntimeEnvironment,
    runtimeParams: RuntimeParams
  ): Promise<LinkedModuleDefinition>
  private createLinkedModuleDefinition
  private delegateGetModuleEntryOnServices
  private delegateGetModuleOnProviders
  getPublicApi(): PublicModuleRegistry
}
export {}
