import type { RuntimeEnvironment, RuntimeParams, Specifier } from '@lwrjs/types'
export default function linkEsm(
  moduleId: {
    specifier: Specifier
    version: string
  },
  environment: RuntimeEnvironment,
  params?: RuntimeParams,
  signature?: string,
  bundleId?: string,
  external?: Record<string, string>
): string
