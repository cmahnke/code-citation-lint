import Ajv, {type Options} from 'ajv'
import Ajv2019 from 'ajv/dist/2019.js'
import addFormats from 'ajv-formats'

/**
 * Creates an ajv instance appropriate for the given schema:
 * - schemas declaring draft 2019-09 (e.g. the CFF 1.3.0 draft) need Ajv2019
 * - `unicodeRegExp: false` keeps legacy regexes (pykwalify era) compilable
 * - `ajv-formats` provides the `date`/`uri` formats used by the CFF schemas
 */
export function createAjv(schema: {$schema?: string}): Ajv {
  const options: Options = {allErrors: true, strict: false, unicodeRegExp: false}
  const is2019 = typeof schema.$schema === 'string' && schema.$schema.includes('2019-09')
  const instance = is2019 ? new Ajv2019(options) : new Ajv(options)
  addFormats(instance)
  return instance as unknown as Ajv
}
