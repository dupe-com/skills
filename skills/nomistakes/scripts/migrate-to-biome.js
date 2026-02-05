#!/usr/bin/env node

/**
 * Migrate from ESLint/Prettier to Biome
 * 
 * This script automates the migration to Biome (biomejs.dev), a fast Rust-based
 * linter and formatter that replaces ESLint + Prettier with a single tool.
 * 
 * Benefits:
 * - 50-100x faster than ESLint
 * - Zero config TypeScript support
 * - Single tool for linting + formatting
 * - Compatible with most ESLint rules
 * 
 * Usage: node scripts/migrate-to-biome.js
 * 
 * What it does:
 * 1. Checks for existing ESLint/Prettier config
 * 2. Installs Biome as dev dependency
 * 3. Generates biome.json config
 * 4. Removes ESLint/Prettier dependencies
 * 5. Updates package.json scripts
 * 6. Creates backup of removed configs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  const colorCode = colors[color] ?? colors.reset;
  console.log(`${colorCode}${message}${colors.reset}`);
}

function step(message) {
  log(`\n→ ${message}`, 'cyan');
}

function success(message) {
  log(`  ✓ ${message}`, 'green');
}

function warning(message) {
  log(`  ⚠ ${message}`, 'yellow');
}

function error(message) {
  log(`  ✗ ${message}`, 'red');
}

function info(message) {
  log(`  ${message}`, 'gray');
}

// Files to check for existing linter/formatter config
const CONFIG_FILES = {
  eslint: [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
  ],
  prettier: [
    '.prettierrc',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    'prettier.config.js',
    'prettier.config.cjs',
  ],
};

// Packages to remove
const PACKAGES_TO_REMOVE = [
  'eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'eslint-config-prettier',
  'eslint-plugin-prettier',
  'prettier',
];

function findRootDir() {
  let dir = process.cwd();
  let iterations = 0;
  const MAX_ITERATIONS = 100;

  // Look for package.json with iteration limit to prevent infinite loops
  while (dir !== '/' && iterations < MAX_ITERATIONS) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
    iterations++;
  }

  return process.cwd();
}

function findExistingConfigs(rootDir) {
  const found = {
    eslint: [],
    prettier: [],
  };
  
  // Check for ESLint configs
  CONFIG_FILES.eslint.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      found.eslint.push(file);
    }
  });
  
  // Check for Prettier configs
  CONFIG_FILES.prettier.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      found.prettier.push(file);
    }
  });
  
  // Check package.json for embedded configs
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg === 'object' && !Array.isArray(pkg)) {
        if (pkg.eslintConfig) {
          found.eslint.push('package.json (eslintConfig field)');
        }
        if (pkg.prettier) {
          found.prettier.push('package.json (prettier field)');
        }
      }
    } catch (e) {
      warning(`Could not parse package.json: ${e.message}`);
    }
  }

  return found;
}

function backupConfigs(rootDir, configs) {
  const backupDir = path.join(rootDir, '.biome-migration-backup');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const backedUp = [];
  
  [...configs.eslint, ...configs.prettier].forEach(file => {
    if (file.includes('package.json')) return; // Handle separately
    
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(backupDir, file);
    
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      backedUp.push(file);
    }
  });
  
  return { backupDir, backedUp };
}

function generateBiomeConfig() {
  return {
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
        ".nuxt",
        "coverage",
        "*.min.js"
      ]
    },
    "formatter": {
      "enabled": true,
      "formatWithErrors": false,
      "indentStyle": "space",
      "indentWidth": 2,
      "lineEnding": "lf",
      "lineWidth": 100,
      "attributePosition": "auto"
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
        "bracketSpacing": true,
        "bracketSameLine": false
      }
    },
    "json": {
      "formatter": {
        "enabled": true,
        "indentStyle": "space",
        "indentWidth": 2,
        "lineWidth": 100
      },
      "linter": {
        "enabled": true
      }
    }
  };
}

function updatePackageJson(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse package.json: ${e.message}`);
  }

  // Validate pkg structure
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('Invalid package.json structure');
  }

  // Remove old config fields
  const removedFields = [];
  if (pkg.eslintConfig) {
    delete pkg.eslintConfig;
    removedFields.push('eslintConfig');
  }
  if (pkg.prettier) {
    delete pkg.prettier;
    removedFields.push('prettier');
  }

  // Update scripts
  const oldScripts = { ...(pkg.scripts || {}) };
  pkg.scripts = pkg.scripts || {};

  // Replace lint/format scripts
  const scriptUpdates = {
    'lint': 'biome lint .',
    'format': 'biome format --write .',
    'format:check': 'biome format .',
    'check': 'biome check .',
    'check:fix': 'biome check --write .',
  };

  Object.entries(scriptUpdates).forEach(([key, value]) => {
    pkg.scripts[key] = value;
  });

  try {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch (e) {
    throw new Error(`Failed to write package.json: ${e.message}`);
  }

  return { removedFields, oldScripts };
}

function detectPackageManager(rootDir) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(rootDir, 'bun.lockb'))) {
    return 'bun';
  }
  return 'npm';
}

function installBiome(rootDir, packageManager) {
  const commands = {
    npm: 'npm install --save-dev --save-exact @biomejs/biome',
    yarn: 'yarn add --dev --exact @biomejs/biome',
    pnpm: 'pnpm add --save-dev --save-exact @biomejs/biome',
    bun: 'bun add --dev --exact @biomejs/biome',
  };

  const command = commands[packageManager];
  if (!command) {
    throw new Error(`Unknown package manager: ${packageManager}`);
  }

  try {
    execSync(command, { cwd: rootDir, stdio: 'inherit' });
  } catch (e) {
    throw new Error(`Failed to install Biome: ${e.message}`);
  }
}

function removeOldPackages(rootDir, packageManager) {
  const pkgPath = path.join(rootDir, 'package.json');

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse package.json: ${e.message}`);
  }

  // Validate pkg structure
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('Invalid package.json structure');
  }

  const toRemove = PACKAGES_TO_REMOVE.filter(name => {
    return (pkg.devDependencies && pkg.devDependencies[name]) ||
           (pkg.dependencies && pkg.dependencies[name]);
  });

  if (toRemove.length === 0) {
    return [];
  }

  const commands = {
    npm: `npm uninstall ${toRemove.join(' ')}`,
    yarn: `yarn remove ${toRemove.join(' ')}`,
    pnpm: `pnpm remove ${toRemove.join(' ')}`,
    bun: `bun remove ${toRemove.join(' ')}`,
  };

  const command = commands[packageManager];
  if (!command) {
    throw new Error(`Unknown package manager: ${packageManager}`);
  }

  try {
    execSync(command, { cwd: rootDir, stdio: 'inherit' });
  } catch (e) {
    throw new Error(`Failed to remove packages: ${e.message}`);
  }

  return toRemove;
}

function removeConfigFiles(rootDir, configs) {
  const removed = [];
  
  [...configs.eslint, ...configs.prettier].forEach(file => {
    if (file.includes('package.json')) return; // Already handled
    
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed.push(file);
    }
  });
  
  return removed;
}

async function main() {
  log('\n╔═══════════════════════════════════════╗', 'cyan');
  log('║  Biome Migration Script              ║', 'cyan');
  log('║  ESLint + Prettier → Biome            ║', 'cyan');
  log('╚═══════════════════════════════════════╝\n', 'cyan');
  
  const rootDir = findRootDir();
  log(`Working directory: ${rootDir}\n`, 'gray');
  
  // Step 1: Check existing configs
  step('Checking for existing ESLint/Prettier configuration...');
  const configs = findExistingConfigs(rootDir);
  
  if (configs.eslint.length === 0 && configs.prettier.length === 0) {
    warning('No ESLint or Prettier configuration found.');
    warning('Biome will be installed with default configuration.');
  } else {
    if (configs.eslint.length > 0) {
      success(`Found ESLint config: ${configs.eslint.join(', ')}`);
    }
    if (configs.prettier.length > 0) {
      success(`Found Prettier config: ${configs.prettier.join(', ')}`);
    }
  }
  
  // Step 2: Backup existing configs
  if (configs.eslint.length > 0 || configs.prettier.length > 0) {
    step('Creating backup of existing configurations...');
    const { backupDir, backedUp } = backupConfigs(rootDir, configs);
    success(`Backed up ${backedUp.length} file(s) to ${path.relative(rootDir, backupDir)}/`);
    backedUp.forEach(file => info(`  - ${file}`));
  }
  
  // Step 3: Detect package manager
  step('Detecting package manager...');
  const packageManager = detectPackageManager(rootDir);
  success(`Using ${packageManager}`);
  
  // Step 4: Install Biome
  step('Installing @biomejs/biome...');
  try {
    installBiome(rootDir, packageManager);
    success('Biome installed successfully');
  } catch (err) {
    error('Failed to install Biome');
    error(err.message);
    process.exit(1);
  }
  
  // Step 5: Generate biome.json
  step('Generating biome.json configuration...');
  const biomeConfig = generateBiomeConfig();
  const biomeConfigPath = path.join(rootDir, 'biome.json');
  try {
    fs.writeFileSync(biomeConfigPath, JSON.stringify(biomeConfig, null, 2) + '\n');
    success('Created biome.json');
  } catch (e) {
    error(`Failed to write biome.json: ${e.message}`);
    process.exit(1);
  }
  
  // Step 6: Update package.json
  step('Updating package.json scripts...');
  const { removedFields, oldScripts } = updatePackageJson(rootDir);
  success('Updated package.json scripts');
  if (removedFields.length > 0) {
    info(`Removed fields: ${removedFields.join(', ')}`);
  }
  
  // Step 7: Remove old packages
  step('Removing ESLint/Prettier packages...');
  try {
    const removed = removeOldPackages(rootDir, packageManager);
    if (removed.length > 0) {
      success(`Removed ${removed.length} package(s):`);
      removed.forEach(pkg => info(`  - ${pkg}`));
    } else {
      info('No old packages to remove');
    }
  } catch (err) {
    warning('Failed to remove old packages');
    warning('You can manually remove them later');
    info(err.message);
  }
  
  // Step 8: Remove old config files
  if (configs.eslint.length > 0 || configs.prettier.length > 0) {
    step('Removing old configuration files...');
    const removed = removeConfigFiles(rootDir, configs);
    if (removed.length > 0) {
      success(`Removed ${removed.length} config file(s):`);
      removed.forEach(file => info(`  - ${file}`));
    }
  }
  
  // Summary
  log('\n╔═══════════════════════════════════════╗', 'green');
  log('║  Migration Complete! 🎉               ║', 'green');
  log('╚═══════════════════════════════════════╝\n', 'green');
  
  log('Next steps:', 'cyan');
  log('  1. Review biome.json and adjust rules as needed', 'gray');
  log('  2. Run: npm run check (or yarn/pnpm/bun check)', 'gray');
  log('  3. Run: npm run format (or yarn/pnpm/bun format)', 'gray');
  log('  4. Update your CI/CD scripts to use Biome', 'gray');
  log('  5. Update editor integrations (see docs/BIOME_MIGRATION.md)', 'gray');
  
  log('\nAvailable scripts:', 'cyan');
  log('  npm run lint       - Run linter', 'gray');
  log('  npm run format     - Format code', 'gray');
  log('  npm run check      - Lint + format check', 'gray');
  log('  npm run check:fix  - Lint + format with auto-fix', 'gray');
  
  if (configs.eslint.length > 0 || configs.prettier.length > 0) {
    log('\nBackup location:', 'yellow');
    log('  .biome-migration-backup/ (safe to delete after verification)', 'gray');
  }
  
  log('\nDocumentation:', 'cyan');
  log('  • Migration guide: docs/BIOME_MIGRATION.md', 'gray');
  log('  • Biome docs: https://biomejs.dev', 'gray');
  log('');
}

// Run migration
main().catch(err => {
  error('\nMigration failed:');
  error(err.message);
  // Only show full stack trace in debug mode to avoid overwhelming users
  if (process.env.DEBUG) {
    console.error(err);
  } else {
    info('Set DEBUG=1 for full stack trace');
  }
  process.exit(1);
});
