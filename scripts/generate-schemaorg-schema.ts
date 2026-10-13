/**
 * Generates the schema.org software profile JSON Schema.
 *
 * schema.org has no JSON Schema; this generator derives one from a curated
 * term list covering the properties relevant for software metadata:
 * Thing + CreativeWork + SoftwareSourceCode + SoftwareApplication.
 *
 * - unknown terms are rejected (`additionalProperties: false`), other
 *   `@`-keys (e.g. @id, @graph) are JSON-LD machinery and allowed
 * - dates and agent-like terms get safe structural type constraints
 * - single-vs-array flexibility is preserved (schema.org/JSON-LD allows both)
 */

import {writeFile, mkdir} from 'node:fs/promises'
import path from 'node:path'
import {DEFINITIONS, termToSchema} from './lib/schema-definitions.js'

const SCHEMA_DIR = path.resolve(import.meta.dirname, '../schemas')

const CONTEXT_URLS = [
  'https://schema.org',
  'http://schema.org'
  // Versioned contexts (https://schema.org/version/3.9/) are handled by pattern
]

const DATE_TERMS = new Set(['dateCreated', 'dateModified', 'datePublished'])

const TERMS: string[] = [
  // Thing
  'additionalType',
  'alternateName',
  'description',
  'disambiguatingDescription',
  'identifier',
  'image',
  'mainEntityOfPage',
  'name',
  'potentialAction',
  'sameAs',
  'subjectOf',
  'url',
  // CreativeWork
  'abstract',
  'about',
  'accessibilitySummary',
  'accountablePerson',
  'aggregateRating',
  'alternativeHeadline',
  'associatedMedia',
  'audience',
  'audio',
  'author',
  'award',
  'character',
  'citation',
  'comment',
  'commentCount',
  'contentLocation',
  'contentRating',
  'contributor',
  'copyrightHolder',
  'copyrightYear',
  'correction',
  'countryOfOrigin',
  'creativeWorkStatus',
  'dateCreated',
  'dateModified',
  'datePublished',
  'director',
  'editor',
  'encoding',
  'encodingFormat',
  'exampleOfWork',
  'expires',
  'funder',
  'genre',
  'hasPart',
  'headline',
  'inLanguage',
  'interactivityType',
  'isAccessibleForFree',
  'isBasedOn',
  'isFamilyFriendly',
  'isPartOf',
  'keywords',
  'learningResourceType',
  'license',
  'locationCreated',
  'mainEntity',
  'maintainer',
  'material',
  'mentions',
  'producer',
  'provider',
  'publication',
  'publisher',
  'publishingPrinciples',
  'releasedEvent',
  'review',
  'schemaVersion',
  'sdDatePublished',
  'sdLicense',
  'sdPublisher',
  'size',
  'sourceOrganization',
  'spatialCoverage',
  'sponsor',
  'temporalCoverage',
  'text',
  'thumbnailUrl',
  'timeRequired',
  'translationOfWork',
  'translator',
  'typicalAgeRange',
  'version',
  'video',
  'workExample',
  'workTranslation',
  // SoftwareSourceCode
  'codeRepository',
  'codeSampleType',
  'programmingLanguage',
  'runtimePlatform',
  'sampleType',
  'targetProduct',
  // SoftwareApplication
  'applicationCategory',
  'applicationSubCategory',
  'applicationSuite',
  'device',
  'downloadUrl',
  'executableRequirements',
  'featureList',
  'fileFormat',
  'fileSize',
  'installUrl',
  'memoryRequirements',
  'operatingSystem',
  'permissions',
  'processorRequirements',
  'releaseNotes',
  'screenshot',
  'softwareAddOn',
  'softwareHelp',
  'softwareRequirements',
  'softwareVersion',
  'storageRequirements'
]

const CLASS_TYPES = ['SoftwareSourceCode', 'SoftwareApplication', 'Dataset', 'WebSite', 'WebPage']

async function main(): Promise<void> {
  const versionDir = path.join(SCHEMA_DIR, 'schemaorg')
  await mkdir(versionDir, {recursive: true})

  const properties: Record<string, unknown> = {
    '@context': {
      description: 'JSON-LD context. Must reference schema.org.',
      anyOf: [
        {anyOf: [{enum: CONTEXT_URLS}, {type: 'string', pattern: '^https?://schema\\.org(/version/[\\w.]+)?/?$'}]},
        {type: 'array', items: {anyOf: [{enum: CONTEXT_URLS}, {type: 'string'}, {type: 'object'}]}}
      ]
    },
    '@type': {type: 'string', enum: [...CLASS_TYPES].sort()},
    '@id': {type: 'string'}
  }
  for (const term of TERMS) {
    properties[term] = termToSchema(term, DATE_TERMS.has(term) ? {'@type': 'schema:Date'} : {})
  }

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'schema.org software profile',
    description:
      'Schema for schema.org documents describing software (SoftwareSourceCode, SoftwareApplication, Dataset), generated from a curated property list.',
    type: 'object',
    properties,
    patternProperties: {
      '^@': {}
    },
    additionalProperties: false,
    definitions: DEFINITIONS
  }

  const outFile = path.join(versionDir, 'software.json')
  await writeFile(outFile, JSON.stringify(schema, null, 2) + '\n', 'utf8')
  console.log(`OK schemaorg: ${TERMS.length} terms -> ${path.relative(process.cwd(), outFile)}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
