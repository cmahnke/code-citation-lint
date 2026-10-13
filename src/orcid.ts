/**
 * Shared ORCID helpers: the canonical URL pattern and the ISO 7064 MOD 11-2
 * check-digit validation used by the ORCID registry.
 */

export const ORCID_PATTERN = /^https?:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/

function validCheckDigit(id: string): boolean {
  const digits = id.replace(/^https?:\/\/orcid\.org\//i, '').replace(/-/g, '')
  if (!/^\d{15}[\dX]$/.test(digits)) return false
  let total = 0
  for (const character of digits.slice(0, 15)) {
    total = (total + Number(character)) * 2
  }
  const check = (12 - (total % 11)) % 11
  const expected = check === 10 ? 'X' : String(check)
  return digits[15] === expected
}

/**
 * Returns why the ORCID is invalid, or undefined when it is well-formed and
 * passes the check digit.
 */
export function orcidProblem(id: string): 'format' | 'check-digit' | undefined {
  if (!/orcid\.org/i.test(id)) return undefined
  if (!ORCID_PATTERN.test(id)) return 'format'
  if (!validCheckDigit(id)) return 'check-digit'
  return undefined
}
