# Biome Migration Guide

Complete guide for migrating from ESLint + Prettier to Biome.

## Table of Contents

- [What is Biome?](#what-is-biome)
- [Why Migrate?](#why-migrate)
- [Quick Migration](#quick-migration)
- [Manual Migration](#manual-migration)
- [Configuration](#configuration)
- [Editor Integration](#editor-integration)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Rule Compatibility](#rule-compatibility)

## What is Biome?

[Biome](https://biomejs.dev) is a fast, Rust-based toolchain for web development that combines linting and formatting in a single tool. It's designed as a drop-in replacement for ESLint and Prettier.

**Key Features:**
- 🚀 **50-100x faster** than ESLint
- 🔧 **Single tool** for linting + formatting
- 📦 **Zero config** TypeScript support
- 🎯 **Compatible** with most ESLint rules
- 🔄 **Incremental** - only checks changed files
- 💾 **Small binary** - no plugin ecosystem bloat

## Why Migrate?

### Performance Benefits

```bash
# ESLint + Prettier (typical project)
$ time npm run lint && npm run format
✓ Completed in 8.3s

# Biome (same project)
$ time npm run check
✓ Completed in 0.2s
```

**41x faster** in real-world usage.

### Simplified Tooling

**Before (ESLint + Prettier):**
```json
{
  "devDependencies": {
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.1.3",
    "prettier": "^3.2.5"
  }
}
```

**After (Biome):**
```json
{
  "devDependencies": {
    "@biomejs/biome": "1.9.4"
  }
}
```

One dependency, one config file, one command.

### Better Developer Experience

- **Single source of truth** - No conflicts between linter and formatter
- **Faster CI** - Reduce build times by 40-90%
- **Instant feedback** - Sub-second lint on save
- **Better errors** - Clear, actionable error messages

## Quick Migration

The easiest way to migrate is using the automated script:

```bash
# Run migration script
node scripts/migrate-to-biome.js
```

**What the script does:**
1. ✓ Detects existing ESLint/Prettier config
2. ✓ Creates backup of old configs
3. ✓ Installs Biome
4. ✓ Generates `biome.json` config
5. ✓ Updates `package.json` scripts
6. ✓ Removes ESLint/Prettier dependencies
7. ✓ Cleans up old config files

**After running the script:**
```bash
# Test the migration
npm run check

# Format your code
npm run format

# Fix issues automatically
npm run check:fix
```

## Manual Migration

If you prefer manual control or the script doesn't work for your setup:

### 1. Install Biome

```bash
# npm
npm install --save-dev --save-exact @biomejs/biome

# yarn
yarn add --dev --exact @biomejs/biome

# pnpm
pnpm add --save-dev --save-exact @biomejs/biome

# bun
bun add --dev --exact @biomejs/biome
```

### 2. Initialize Configuration

```bash
npx @biomejs/biome init
```

This creates a basic `biome.json`. See [Configuration](#configuration) for customization.

### 3. Update package.json Scripts

Replace your lint/format scripts:

```json
{
  "scripts": {
    "lint": "biome lint .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "check": "biome check .",
    "check:fix": "biome check --write ."
  }
}
```

### 4. Remove Old Dependencies

```bash
npm uninstall eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier eslint-plugin-prettier prettier
```

### 5. Remove Old Config Files

Delete or archive:
- `.eslintrc*`
- `.prettierrc*`
- `prettier.config.js`
- `eslintConfig` field in `package.json`
- `prettier` field in `package.json`

### 6. Test the Migration

```bash
# Check for issues
npm run check

# Fix auto-fixable issues
npm run check:fix

# Format all files
npm run format
```

## Configuration

### Basic Configuration

A minimal `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

### Recommended Configuration

A production-ready config with common customizations:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "ignore": [
      "node_modules",
      "dist",
      "build",
      ".next",
      "coverage"
    ]
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "useConst": "error",
        "useTemplate": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSpacing": true
    }
  }
}
```

### Migrating ESLint Rules

Biome has built-in equivalents for most popular ESLint rules. Use the official migration tool:

```bash
# Convert .eslintrc to biome.json rules
npx @biomejs/biome migrate eslint --write
```

This will:
- Read your `.eslintrc` file
- Map ESLint rules to Biome equivalents
- Update `biome.json` with the configuration

### Ignore Files

Biome respects `.gitignore` by default when VCS is enabled. You can also create a `.biomeignore`:

```
# .biomeignore
node_modules/
dist/
build/
*.min.js
*.d.ts
```

## Editor Integration

### VS Code

1. **Install the extension:**
   ```
   ext install biomejs.biome
   ```

2. **Configure as default formatter** (`.vscode/settings.json`):
   ```json
   {
     "editor.defaultFormatter": "biomejs.biome",
     "editor.formatOnSave": true,
     "[javascript]": {
       "editor.defaultFormatter": "biomejs.biome"
     },
     "[typescript]": {
       "editor.defaultFormatter": "biomejs.biome"
     },
     "[json]": {
       "editor.defaultFormatter": "biomejs.biome"
     }
   }
   ```

3. **Disable conflicting extensions:**
   - Disable or uninstall ESLint extension
   - Disable or uninstall Prettier extension

### Other Editors

- **IntelliJ/WebStorm:** Install [Biome plugin](https://plugins.jetbrains.com/plugin/22761-biome)
- **Neovim:** Use [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig) with Biome LSP
- **Sublime Text:** Install via Package Control
- **Zed:** Built-in support (enable in settings)

### CLI Usage

```bash
# Check files
biome check .

# Check and auto-fix
biome check --write .

# Format only
biome format --write .

# Lint only
biome lint .

# Check specific files
biome check src/**/*.ts

# Check stdin
echo "const x=1" | biome format --stdin-file-path=test.js
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Lint & Format

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      
      - run: npm ci
      
      - name: Run Biome
        run: npm run check
```

### GitLab CI

```yaml
lint:
  image: node:20
  script:
    - npm ci
    - npm run check
  only:
    - merge_requests
    - main
```

### Pre-commit Hook

Using [husky](https://github.com/typicode/husky):

```json
{
  "scripts": {
    "prepare": "husky install"
  }
}
```

`.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx @biomejs/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true --changed
```

Using [lint-staged](https://github.com/okonet/lint-staged):

```json
{
  "lint-staged": {
    "*": "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"
  }
}
```

## Troubleshooting

### Common Issues

#### Issue: "Biome not found"

**Cause:** Biome not installed or not in PATH.

**Fix:**
```bash
# Ensure it's installed
npm install --save-dev @biomejs/biome

# Run via npx
npx @biomejs/biome check .
```

#### Issue: "Unknown file extension"

**Cause:** Biome doesn't recognize the file type.

**Fix:** Add to `biome.json`:
```json
{
  "files": {
    "ignoreUnknown": true
  }
}
```

#### Issue: "Too many errors"

**Cause:** First run after migration may show many violations.

**Fix:** Auto-fix what you can, then address remaining issues:
```bash
# Auto-fix safe issues
biome check --write .

# Review remaining issues
biome check .
```

#### Issue: "Rule not found"

**Cause:** ESLint rule has no Biome equivalent.

**Fix:** Check [rule compatibility](#rule-compatibility) or disable the rule:
```json
{
  "linter": {
    "rules": {
      "suspicious": {
        "noConsoleLog": "off"
      }
    }
  }
}
```

#### Issue: "Format conflicts with Prettier"

**Cause:** Some team members still using Prettier.

**Fix:** Ensure everyone migrates together. Use `.prettierignore` temporarily:
```
# .prettierignore
*
```

### Performance Issues

If Biome is slower than expected:

1. **Check file count:**
   ```bash
   # See what files Biome is checking
   biome check . --verbose
   ```

2. **Exclude unnecessary paths:**
   ```json
   {
     "files": {
       "ignore": ["node_modules", "dist", "*.min.js"]
     }
   }
   ```

3. **Use incremental mode:**
   ```bash
   # Only check changed files (in Git)
   biome check --changed
   ```

## Rule Compatibility

### ESLint Rules Supported

Biome supports equivalents for most popular ESLint rules:

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `no-unused-vars` | `noUnusedVariables` | ✅ Supported |
| `no-console` | `noConsoleLog` | ✅ Supported |
| `prefer-const` | `useConst` | ✅ Supported |
| `no-var` | `noVar` | ✅ Supported |
| `eqeqeq` | `useStrictEquality` | ✅ Supported |
| `curly` | N/A | ⚠️ Not needed (auto-formatted) |
| `indent` | N/A | ⚠️ Formatter handles this |
| `quotes` | N/A | ⚠️ Formatter handles this |
| `semi` | N/A | ⚠️ Formatter handles this |

### Prettier Options Supported

| Prettier Option | Biome Equivalent | Default |
|-----------------|------------------|---------|
| `printWidth` | `lineWidth` | 80 |
| `tabWidth` | `indentWidth` | 2 |
| `useTabs` | `indentStyle: "tab"` | false |
| `semi` | `semicolons` | true |
| `singleQuote` | `quoteStyle: "single"` | false |
| `trailingComma` | `trailingCommas` | "all" |
| `bracketSpacing` | `bracketSpacing` | true |
| `arrowParens` | `arrowParentheses` | "always" |

### Unsupported Features

Some ESLint/Prettier features are not (yet) supported:

- **ESLint plugins** - Biome has its own rule set, custom plugins not supported
- **Custom parsers** - Biome uses its own Rust parser
- **Prettier plugins** - Not supported, but most languages covered natively
- **Some complex rules** - Check [Biome rules docs](https://biomejs.dev/linter/rules/)

**Workaround:** For critical unsupported rules, you can run ESLint alongside Biome temporarily:

```json
{
  "scripts": {
    "check": "biome check . && eslint --rule 'your-custom-rule' ."
  }
}
```

## Migration Checklist

Use this checklist to ensure a smooth migration:

- [ ] **Before Migration**
  - [ ] Commit all changes (clean working directory)
  - [ ] Document current ESLint/Prettier configs
  - [ ] Run existing lint/format to establish baseline
  - [ ] Inform team members about the migration

- [ ] **Migration**
  - [ ] Run `node scripts/migrate-to-biome.js`
  - [ ] Review generated `biome.json`
  - [ ] Test: `npm run check`
  - [ ] Fix auto-fixable issues: `npm run check:fix`
  - [ ] Address remaining violations manually

- [ ] **Editor Setup**
  - [ ] Install Biome editor extension
  - [ ] Disable ESLint/Prettier extensions
  - [ ] Configure format-on-save
  - [ ] Test in editor (save a file, check formatting)

- [ ] **CI/CD**
  - [ ] Update CI scripts to use `biome check`
  - [ ] Update pre-commit hooks
  - [ ] Test CI pipeline
  - [ ] Update documentation

- [ ] **Team Coordination**
  - [ ] Share migration guide with team
  - [ ] Schedule migration window (avoid mid-sprint)
  - [ ] Ensure all team members update together
  - [ ] Review first few PRs closely

- [ ] **Cleanup**
  - [ ] Verify `.biome-migration-backup/` contents
  - [ ] Delete backup directory after verification
  - [ ] Remove ESLint/Prettier from dependency list
  - [ ] Update README/contributing docs

## Further Resources

- **Official Docs:** https://biomejs.dev
- **VS Code Extension:** https://marketplace.visualstudio.com/items?itemName=biomejs.biome
- **GitHub:** https://github.com/biomejs/biome
- **Discord Community:** https://discord.gg/BypW39g6Yc
- **Migration Guide:** https://biomejs.dev/guides/migrate-eslint-prettier/

## Getting Help

If you encounter issues during migration:

1. **Check the documentation:** https://biomejs.dev/linter/rules/
2. **Search existing issues:** https://github.com/biomejs/biome/issues
3. **Ask in Discord:** https://discord.gg/BypW39g6Yc
4. **Open an issue:** https://github.com/biomejs/biome/issues/new

---

**Migration completed?** Don't forget to update your README and contributing guidelines to reflect the new tooling!
