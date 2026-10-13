/**
 * SPDX license list access. The bare license ids are vendored from the SPDX
 * license list (see `schemas/sources.json` for the fetch date) so validation
 * works offline and in the browser.
 */

import spdxIdData from '../schemas/spdx/ids.json'

const ID_SET: ReadonlySet<string> = new Set(spdxIdData.ids)

/** The version of the vendored SPDX license list (e.g. "3.29"). */
export function spdxLicenseListVersion(): string {
  return spdxIdData.licenseListVersion
}

/** Returns true when the id is in the vendored SPDX license list. */
export function isSpdxId(id: string): boolean {
  return ID_SET.has(id)
}

/** All vendored SPDX license ids. */
export function allSpdxIds(): string[] {
  return [...ID_SET]
}
