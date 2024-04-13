import {
  getModuleUriPrefix,
  getSpecifier,
  normalizeVersionToUri,
  prettyModuleUriSuffix,
} from '@lwrjs/shared-utils'
const SIGNATURE_SIGIL = 's'
const LATEST_SIG = 'latest'
export default function linkEsm(
  moduleId,
  environment,
  params = {},
  signature,
  bundleId,
  external
) {
  const { bundle, debug } = environment
  const { specifier, version } = moduleId
  if (external && external[specifier]) {
    return specifier
  }
  const uriPrefix = getModuleUriPrefix(environment, params, bundleId)
  const vSpecifier = getSpecifier({
    specifier,
    version: normalizeVersionToUri(version),
  })
  const encodedVSpecifier = encodeURIComponent(vSpecifier)
  const latestSignature = signature === undefined || signature === LATEST_SIG
  const sigilSignature = latestSignature
    ? LATEST_SIG
    : `${SIGNATURE_SIGIL}/${signature}`
  const prettyUrl =
    (bundle ? 'bundle_' : '') + prettyModuleUriSuffix(bundleId || specifier)
  const debugModifier = debug ? '?debug=true' : ''
  return `${uriPrefix}${encodedVSpecifier}/${sigilSignature}/${prettyUrl}.js${debugModifier}`
}
