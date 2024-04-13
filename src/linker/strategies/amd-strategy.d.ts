import type { Specifier } from '@lwrjs/types'
export default function amdLinkingStrategy(moduleId: {
  specifier: Specifier
  version: string
}): string
