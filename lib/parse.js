import R from 'ramda'
import {Parser, TokenScanner, TokenMatcher, AstBuilder} from 'gherkin'
import keywords from 'gherkin/lib/gherkin/gherkin-languages.json'

export function parseBlocks(markdown) {
  let inBlock = false
  let startLine
  let type
  let title
  let blockLines = []
  let blocks = []

  const blockRe = /^```(.*)$/
  const titleRe = /^#([^#].*)$/
  const lines = markdown.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const blockMatches = blockRe.exec(line)
    const titleMatches = titleRe.exec(line)

    if (titleMatches && !inBlock) {
      title = titleMatches[1].trim()

    } else if (blockMatches && !inBlock) {
      inBlock = true
      startLine = i + 1
      type = blockMatches[1].trim()

    } else if (line === '```' && inBlock) {
      blocks.push({
        type,
        title,
        startLine,
        endLine: i + 1,
        content: blockLines.join('\n')
      })

      blockLines = []
      type = undefined
      inBlock = false

    } else if (inBlock) {
      blockLines.push(line)
    }
  }

  return blocks
}

export const parseFeatures = R.curry(function parseFeatures(options, block) {
  const {
    defaultLanguage = 'en'
  } = options

  let {content, title} = block

  let languageMatches = /#\s*language\s*:(.+)/.exec(content)
  let language

  if (languageMatches) {
    language = languageMatches[1].trim()
  } else {
    language = defaultLanguage
  }

  const featureKeywords = keywords[language].feature

  const contentHasFeature = featureKeywords.some(featureKeyword =>
    new RegExp(featureKeyword.trim() + '\s*' + ':').test(content)
  )

  if (!contentHasFeature) {
    const titleHasFeature = featureKeywords.some(featureKeyword =>
      new RegExp(featureKeyword.trim() + '\s*' + ':').test(title)
    )

    if (!titleHasFeature) {
      throw new Error(`Title "${title}" is not feature definition`)
    }

    content = `${title}\n${content}`
  }

  if (!languageMatches) {
    content = `# language: ${language}\n${content}`
  }

  const parser = new Parser()
  let ast

  try {
    ast = parser.parse(
      new TokenScanner(content),
      new AstBuilder(),
      new TokenMatcher()
    )
  } catch (err) {
    if (!/Parser errors/.test(err.message)) {
      throw err
    }

    let message = err.message.split('\n')[1]

    if (options.file) {
      message = `${options.file} ${message}`
    }

    throw new Error(message)
  }

  return ast.scenarioDefinitions.map(scenario => {
    if (scenario.name.trim() === '') {
      throw new Error('Scenario has no name')
    }

    if (scenario.steps.length === 0 && scenario.description && scenario.description.trim() === '') {
      throw new Error(`Scenario: "${scenario.name}" has no steps`)
    }

    return {
      ...ast,
      fakeLanguage: !languageMatches,
      fakeName: !contentHasFeature,
      scenarioDefinitions: [scenario]
    }
  })
})