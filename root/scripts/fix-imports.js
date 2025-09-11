#!/usr/bin/env node

/**
 * Fix imports in custom tests
 * Заменяет .js импорты на .ts в custom тестах
 */

const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'tests', 'custom');

function fixFile(filePath) {
  console.log(`Processing ${filePath}...`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Заменяем импорты из src на .ts
  content = content.replace(
    /from '\.\.\/\.\.\/src\/([^']*)\.js'/g,
    "from '../../src/$1.ts'"
  );

  // Заменяем импорты из dist на .js (оставляем как есть, если это нужно)
  // content = content.replace(
  //   /from '\.\.\/\.\.\/dist\/([^']*)\.js'/g,
  //   "from '../../dist/$1.js'"
  // );

  if (content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content, 'utf8');
    changed = true;
    console.log(`✅ Fixed imports in ${filePath}`);
  } else {
    console.log(`⏭️  No changes needed in ${filePath}`);
  }

  return changed;
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      processDirectory(filePath);
    } else if (file.endsWith('.test.ts') || file.endsWith('.ts')) {
      fixFile(filePath);
    }
  }
}

console.log('🔧 Fixing imports in custom tests...');
console.log(`📁 Processing directory: ${testDir}`);

processDirectory(testDir);

console.log('✅ Import fixing completed!');
