#!/usr/bin/env node
/**
 * Runs every tests/*.test.js in its own process and reports a summary.
 * `node tests/run.js colour` runs only suites whose filename matches.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const filter = process.argv[2];
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => !filter || f.includes(filter))
  .sort();

if (!files.length) {
  console.error(filter ? `no suites match "${filter}"` : 'no suites found');
  process.exit(1);
}

(async () => {
  const started = Date.now();
  const failed = [];
  for (const f of files) {
    const code = await new Promise(resolve => {
      const p = spawn(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
      p.on('close', resolve);
    });
    if (code !== 0) failed.push(f);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(60));
  if (failed.length) {
    console.log(`✗ ${failed.length} of ${files.length} suites failed in ${secs}s: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ all ${files.length} suites passed in ${secs}s`);
})();
