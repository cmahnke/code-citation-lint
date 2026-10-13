import {
  CFF_VERSIONS,
  CODEMETA_VERSIONS,
  classifyByName,
  lintContent,
  lintUrl
} from '../src/browser.ts'

const $ = id => document.getElementById(id)

const EXAMPLE_CODEMETA = JSON.stringify(
  {
    '@context': 'https://w3id.org/codemeta/3.0',
    '@type': 'SoftwareSourceCode',
    name: 'Example Tool',
    description: 'A small example tool to demonstrate the linter.',
    author: [
      {
        '@type': 'Person',
        givenName: 'Ada',
        familyName: 'Lovelace',
        '@id': 'https://orcid.org/0000-0002-1825-0097'
      }
    ],
    license: 'MIT',
    codeRepository: 'https://github.com/example/tool',
    softwareVersion: '1.0.0',
    datePublished: '2024-06-01',
    keywords: ['example', 'demo']
  },
  null,
  2
)

const EXAMPLE_CFF = [
  'cff-version: 1.2.0',
  'message: If you use this software, please cite it using these metadata.',
  'title: Example Tool',
  'authors:',
  '  - given-names: Ada',
  '    family-names: Lovelace',
  'version: 1.0.0',
  'date-released: "2024-06-01"',
  'license: MIT',
  'repository-code: "https://github.com/example/tool"',
  'keywords:',
  '  - example',
  '  - demo'
].join('\n')

// Populate the version dropdowns from the registries
function populateVersions() {
  const select = $('opt-version')
  const codemeta = document.createElement('optgroup')
  codemeta.label = 'CodeMeta'
  for (const info of CODEMETA_VERSIONS) {
    const option = document.createElement('option')
    option.value = `codemeta:${info.version}`
    option.textContent = `CodeMeta ${info.version}`
    codemeta.append(option)
  }
  const cff = document.createElement('optgroup')
  cff.label = 'CFF'
  for (const info of CFF_VERSIONS) {
    const option = document.createElement('option')
    option.value = `cff:${info.version}`
    option.textContent = `CFF ${info.version}${info.status === 'draft' ? ' (draft)' : ''}`
    cff.append(option)
  }
  select.append(codemeta, cff)
}

function selectedOptions() {
  const type = $('opt-type').value
  const versionValue = $('opt-version').value
  const split = versionValue ? versionValue.split(':') : []
  const version = split[1]
  return {
    type: type === 'auto' ? undefined : type,
    version,
    strict: $('opt-strict').checked
  }
}

function renderResults(results) {
  const container = $('results')
  container.replaceChildren()

  for (const result of results) {
    const verdict = document.createElement('div')
    const hasErrors = result.errors.length > 0
    const failsStrict = selectedOptions().strict && result.warnings.length > 0
    verdict.className = `verdict ${hasErrors || failsStrict ? 'invalid' : 'valid'}`
    const location = result.file ?? '(input)'
    const version = result.version ? `${result.type.toUpperCase()} ${result.version}` : result.type.toUpperCase()
    const origin = result.versionSource
    verdict.textContent = `${hasErrors || failsStrict ? '✗' : '✓'} ${location} — ${version} (${origin}) — ${hasErrors ? 'INVALID' : failsStrict ? 'INVALID (strict)' : 'VALID'}`
    container.append(verdict)

    const all = [...result.errors, ...result.warnings, ...result.infos]
    if (all.length === 0) {
      const none = document.createElement('p')
      none.className = 'hint'
      none.textContent = 'No findings.'
      container.append(none)
    }
    for (const finding of all) {
      const item = document.createElement('div')
      item.className = `finding ${finding.severity}`
      const label = document.createElement('div')
      label.textContent = `${finding.severity}: ${finding.message}`
      const tags = document.createElement('div')
      tags.className = 'rule'
      tags.textContent = [finding.rule, finding.path].filter(Boolean).join(' · ')
      item.append(label, tags)
      container.append(item)
    }
  }
}

async function lintPasted() {
  const content = $('paste-area').value
  if (content.trim().length === 0) {
    renderResults([{file: '(pasted)', type: 'codemeta', version: undefined, versionSource: 'unknown', valid: false, errors: [{severity: 'error', rule: 'input', message: 'Paste a document first.'}], warnings: [], infos: []}])
    return
  }
  const options = selectedOptions()
  const result = lintContent(content, {type: options.type, version: options.version, file: '(pasted)'})
  renderResults([result])
}

async function lintFromUrl() {
  const url = $('url-input').value.trim()
  const options = selectedOptions()
  if (!url) {
    renderResults([
      {
        file: '(url)',
        type: options.type ?? 'codemeta',
        versionSource: 'unknown',
        valid: false,
        errors: [{severity: 'error', rule: 'input', message: 'Enter a URL first.'}],
        warnings: [],
        infos: []
      }
    ])
    return
  }
  const container = $('results')
  container.replaceChildren()
  const pending = document.createElement('p')
  pending.className = 'hint'
  pending.textContent = `Fetching ${url}…`
  container.append(pending)
  try {
    const results = await lintUrl(url, {type: options.type, version: options.version})
    renderResults(results)
  } catch (error) {
    renderResults([
      {
        file: url,
        type: options.type ?? 'codemeta',
        versionSource: 'unknown',
        valid: false,
        errors: [{severity: 'error', rule: 'fetch', message: String(error)}],
        warnings: [],
        infos: []
      }
    ])
  }
}

function setupTabs() {
  const tabs = [
    ['tab-paste', 'input-paste'],
    ['tab-file', 'input-file'],
    ['tab-url', 'input-url']
  ]
  for (const [tabId, panelId] of tabs) {
    $(tabId).addEventListener('click', () => {
      for (const [otherTab, otherPanel] of tabs) {
        $(otherTab).setAttribute('aria-selected', String(otherTab === tabId))
        $(otherPanel).hidden = otherPanel !== panelId
      }
    })
  }
}

function setupFileInput() {
  const dropZone = $('drop-zone')
  const input = $('file-input')
  const handle = async file => {
    if (!file) return
    const content = await file.text()
    const options = selectedOptions()
    const result = lintContent(content, {type: options.type ?? classifyByName(file.name), version: options.version, file: file.name})
    renderResults([result])
  }
  input.addEventListener('change', () => handle(input.files[0]))
  for (const event of ['dragenter', 'dragover']) {
    dropZone.addEventListener(event, eventObject => {
      eventObject.preventDefault()
      dropZone.classList.add('dragover')
    })
  }
  for (const event of ['dragleave', 'drop']) {
    dropZone.addEventListener(event, eventObject => {
      eventObject.preventDefault()
      dropZone.classList.remove('dragover')
    })
  }
  dropZone.addEventListener('drop', eventObject => handle(eventObject.dataTransfer?.files[0]))
}

populateVersions()
setupTabs()
setupFileInput()
$('lint-paste').addEventListener('click', lintPasted)
$('lint-url').addEventListener('click', lintFromUrl)
$('load-example-codemeta').addEventListener('click', () => {
  $('paste-area').value = EXAMPLE_CODEMETA
  $('tab-paste').click()
})
$('load-example-cff').addEventListener('click', () => {
  $('paste-area').value = EXAMPLE_CFF
  $('tab-paste').click()
})
