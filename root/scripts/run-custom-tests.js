#!/usr/bin/env node

/**
 * Custom Test Runner
 * Запускает все тесты из папки custom/ с дополнительными опциями
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'all';

// Опции запуска для разных команд
const commands = {
  all: {
    cmd: 'npm',
    args: ['run', 'test:custom'],
    desc: 'Запуск всех custom тестов'
  },
  api: {
    cmd: 'npm',
    args: ['run', 'test:custom:api'],
    desc: 'Тесты API и CLI'
  },
  search: {
    cmd: 'npm',
    args: ['run', 'test:custom:search'],
    desc: 'Тесты поиска и веб-интеграции'
  },
  fallback: {
    cmd: 'npm',
    args: ['run', 'test:custom:fallback'],
    desc: 'Тесты fallback механизмов'
  },
  core: {
    cmd: 'npm',
    args: ['run', 'test:custom:core'],
    desc: 'Тесты основной логики'
  },
  tools: {
    cmd: 'npm',
    args: ['run', 'test:custom:tools'],
    desc: 'Тесты инструментов'
  },
  security: {
    cmd: 'npm',
    args: ['run', 'test:custom:security'],
    desc: 'Тесты безопасности'
  },
  transcripts: {
    cmd: 'npm',
    args: ['run', 'test:custom'],
    env: { RECORD_TRANSCRIPTS: 'true' },
    desc: 'Запуск с записью транскриптов'
  },
  watch: {
    cmd: 'npx',
    args: ['jest', '--runInBand', '--testPathPattern=tests/custom/', '--watch'],
    desc: 'Запуск в режиме наблюдения'
  },
  working: {
    cmd: 'npm',
    args: ['run', 'test:custom:working'],
    desc: 'Запуск базового рабочего теста'
  },
  very_simple: {
    cmd: 'npm',
    args: ['run', 'test:custom:very-simple'],
    desc: 'Запуск очень простого теста'
  },
  unit: {
    cmd: 'npm',
    args: ['run', 'test:unit'],
    desc: 'Запуск всех unit тестов'
  },
  integration: {
    cmd: 'npm',
    args: ['run', 'test:integration'],
    desc: 'Запуск всех integration тестов'
  }
};

function showHelp() {
  console.log('\n🚀 Custom Test Runner\n');
  console.log('Использование: node scripts/run-custom-tests.js [command]\n');
  console.log('Доступные команды:');
  Object.entries(commands).forEach(([cmd, config]) => {
    console.log(`  ${cmd.padEnd(12)} - ${config.desc}`);
  });
  console.log('\nПримеры:');
  console.log('  node scripts/run-custom-tests.js all        # Все тесты');
  console.log('  node scripts/run-custom-tests.js api        # Только API тесты');
  console.log('  node scripts/run-custom-tests.js search     # Только поиск');
  console.log('  node scripts/run-custom-tests.js transcripts # С транскриптами');
  console.log('  node scripts/run-custom-tests.js watch      # Режим наблюдения');
  console.log('');
}

function runCommand(cmd, args, env = {}) {
  console.log(`\n▶️  Запуск: ${cmd} ${args.join(' ')}\n`);

  const child = spawn(cmd, args, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...env }
  });

  child.on('close', (code) => {
    console.log(`\n${code === 0 ? '✅' : '❌'} Завершено с кодом: ${code}`);
    process.exit(code);
  });

  child.on('error', (error) => {
    console.error('❌ Ошибка выполнения:', error);
    process.exit(1);
  });
}

if (!commands[command]) {
  console.error(`❌ Неизвестная команда: ${command}`);
  showHelp();
  process.exit(1);
}

const config = commands[command];
runCommand(config.cmd, config.args, config.env);
