import { getSpecifier, normalizeVersionToUri } from '@lwrjs/shared-utils'
export default function amdLinkingStrategy(moduleId) {
  const { specifier, version } = moduleId
  return getSpecifier({ specifier, version: normalizeVersionToUri(version) })
}
