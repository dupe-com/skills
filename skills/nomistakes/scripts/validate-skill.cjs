#!/usr/bin/env node

/**
 * Validate SKILL.md against agentskills.io specification
 *
 * Usage: node scripts/validate-skill.cjs [path-to-SKILL.md]
 *
 * Validates:
 * - YAML frontmatter structure (starts/ends with ---)
 * - Required fields: name, description
 * - Field constraints (name format, description length)
 * - Line count recommendation (< 500 lines)
 * - Optional metadata fields format
 */

const fs = require('node:fs')
const path = require('node:path')

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  const colorCode = colors[color] ?? colors.reset
  console.log(`${colorCode}${message}${colors.reset}`)
}

// Constants
const FRONTMATTER_DELIMITER = '---\n'

function validateSkillMd(filePath) {
  log('\n=== SKILL.md Validation ===\n', 'cyan')

  // Input validation
  if (!filePath || typeof filePath !== 'string') {
    log('✗ Invalid file path provided', 'red')
    process.exit(1)
  }

  const errors = []
  const warnings = []
  const info = []

  // Read file with error handling
  if (!fs.existsSync(filePath)) {
    log(`✗ File not found: ${filePath}`, 'red')
    process.exit(1)
  }

  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    log(`✗ Failed to read file: ${e.message}`, 'red')
    process.exit(1)
  }
  const lines = content.split('\n')

  // Check line count
  const lineCount = lines.length
  info.push(`Line count: ${lineCount}`)
  if (lineCount > 500) {
    warnings.push(
      `Line count (${lineCount}) exceeds recommended maximum of 500 lines. Consider moving detailed content to references/ directory.`,
    )
  }

  // Extract frontmatter
  if (!content.startsWith(FRONTMATTER_DELIMITER)) {
    errors.push('SKILL.md must start with YAML frontmatter delimiter (---)')
    return printResults(errors, warnings, info)
  }

  const frontmatterEnd = content.indexOf(
    `\n${FRONTMATTER_DELIMITER.slice(0, -1)}`,
    4,
  )
  if (frontmatterEnd === -1) {
    errors.push('YAML frontmatter must end with --- delimiter')
    return printResults(errors, warnings, info)
  }

  const frontmatter = content.substring(4, frontmatterEnd)
  const frontmatterLines = frontmatter.split('\n')

  // Parse frontmatter (simple YAML parser for our needs)
  const metadata = {}
  let currentArray = null

  for (const line of frontmatterLines) {
    if (line.trim() === '') continue

    // Array item
    if (line.trim().startsWith('- ')) {
      if (currentArray) {
        currentArray.push(line.trim().substring(2))
      }
      continue
    }

    // Key-value pair
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()

      if (value === '') {
        // Array start
        currentArray = []
        metadata[key] = currentArray
      } else {
        // Simple value
        metadata[key] = value
        currentArray = null
      }
    }
  }

  // Validate required fields
  if (!metadata.name) {
    errors.push('Required field missing: name')
  } else {
    // Validate name format (lowercase-hyphenated)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(metadata.name)) {
      errors.push(
        `Invalid name format: "${metadata.name}". Must be lowercase-hyphenated (e.g., "my-skill-name")`,
      )
    }

    // Check name matches directory
    const dirName = path.basename(path.dirname(filePath))
    if (dirName !== '.' && dirName !== metadata.name) {
      warnings.push(
        `Skill name "${metadata.name}" does not match directory name "${dirName}"`,
      )
    }

    info.push(`Name: ${metadata.name}`)
  }

  if (!metadata.description) {
    errors.push('Required field missing: description')
  } else {
    const descLength = metadata.description.length
    if (descLength < 1 || descLength > 1024) {
      errors.push(
        `Description length (${descLength}) must be between 1 and 1024 characters`,
      )
    }
    info.push(`Description: ${descLength} characters`)

    // Check for discovery keywords
    const keywords = ['when', 'use', 'helps', 'for']
    const hasKeywords = keywords.some((kw) =>
      metadata.description.toLowerCase().includes(kw),
    )
    if (!hasKeywords) {
      warnings.push(
        'Description should include discovery keywords (when to use this skill) to help agents find it',
      )
    }
  }

  // Validate optional fields
  if (metadata.version) {
    if (!/^\d+\.\d+\.\d+/.test(metadata.version)) {
      warnings.push(
        `Version "${metadata.version}" should follow semver format (e.g., 1.0.0)`,
      )
    }
    info.push(`Version: ${metadata.version}`)
  }

  if (metadata.license) {
    info.push(`License: ${metadata.license}`)
  }

  if (metadata.author) {
    info.push(`Author: ${metadata.author}`)
  }

  if (metadata.tags) {
    if (Array.isArray(metadata.tags)) {
      info.push(`Tags: ${metadata.tags.length} (${metadata.tags.join(', ')})`)
    } else {
      warnings.push('Tags field should be an array')
    }
  }

  if (metadata.compatibility) {
    if (Array.isArray(metadata.compatibility)) {
      info.push(`Compatibility: ${metadata.compatibility.join(', ')}`)
    } else {
      warnings.push('Compatibility field should be an array')
    }
  }

  // Check for recommended sections
  const contentBody = content.substring(frontmatterEnd + 5)

  const recommendedSections = [
    { name: 'When to Use This Skill', pattern: /##\s+When to Use/i },
    { name: 'When NOT to Use This Skill', pattern: /##\s+When NOT to Use/i },
  ]

  for (const section of recommendedSections) {
    if (!section.pattern.test(contentBody)) {
      warnings.push(`Recommended section missing: "${section.name}"`)
    }
  }

  // Check for references directory
  const referencesDir = path.join(path.dirname(filePath), 'references')
  if (fs.existsSync(referencesDir)) {
    try {
      const refFiles = fs.readdirSync(referencesDir)
      if (refFiles.length > 0) {
        info.push(
          `References: ${refFiles.length} file(s) (${refFiles.join(', ')})`,
        )
      } else {
        warnings.push('References directory exists but is empty')
      }
    } catch (e) {
      // Log with context for debugging, but continue validation
      warnings.push(`Could not read references directory: ${e.message}`)
    }
  }

  // Check for scripts directory
  const scriptsDir = path.join(path.dirname(filePath), 'scripts')
  if (fs.existsSync(scriptsDir)) {
    try {
      const scriptFiles = fs.readdirSync(scriptsDir)
      if (scriptFiles.length > 0) {
        info.push(
          `Scripts: ${scriptFiles.length} file(s) (${scriptFiles.join(', ')})`,
        )
      } else {
        warnings.push('Scripts directory exists but is empty')
      }
    } catch (e) {
      // Log with context for debugging, but continue validation
      warnings.push(`Could not read scripts directory: ${e.message}`)
    }
  }

  printResults(errors, warnings, info)
}

function printResults(errors, warnings, info) {
  // Print info
  if (info.length > 0) {
    log('\nℹ Info:', 'blue')
    info.forEach((msg) => log(`  ${msg}`, 'blue'))
  }

  // Print warnings
  if (warnings.length > 0) {
    log('\n⚠ Warnings:', 'yellow')
    warnings.forEach((msg) => log(`  ${msg}`, 'yellow'))
  }

  // Print errors
  if (errors.length > 0) {
    log('\n✗ Errors:', 'red')
    errors.forEach((msg) => log(`  ${msg}`, 'red'))
    log(`\n❌ Validation FAILED (${errors.length} error(s))\n`, 'red')
    process.exit(1)
  }

  if (warnings.length > 0) {
    log(`\n⚠️  Validation passed with ${warnings.length} warning(s)\n`, 'yellow')
  } else {
    log('\n✓ Validation PASSED\n', 'green')
  }
}

// Main
const args = process.argv.slice(2)
const skillPath = args[0] || 'SKILL.md'

// Wrap main execution in try/catch to ensure graceful exit
try {
  validateSkillMd(skillPath)
} catch (e) {
  log(`\n✗ Unexpected error during validation: ${e.message}`, 'red')
  if (process.env.DEBUG) {
    console.error(e)
  }
  process.exit(1)
}
