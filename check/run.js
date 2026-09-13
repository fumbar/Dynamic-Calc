#!/usr/bin/env node
// Compares every case file under check/cases against its recorded fixture.
//   node check/run.js            verify
//   node check/run.js --update   re-record
const fs = require('fs');
const path = require('path');
const { run } = require('./calc-case');

const update = process.argv.includes('--update');
const casesDir = path.join(__dirname, 'cases');
const fixtureDir = path.join(__dirname, 'fixtures');

let failures = 0;
for (const file of fs.readdirSync(casesDir).filter(f => f.endsWith('.js')).sort()) {
  const name = path.basename(file, '.js');
  const spec = require(path.join(casesDir, file));
  const actual = run(spec.cases, { query: spec.query, globals: spec.globals });
  const fixture = path.join(fixtureDir, name + '.json');

  if (update || !fs.existsSync(fixture)) {
    fs.writeFileSync(fixture, JSON.stringify(actual, null, 1) + '\n');
    console.log(`recorded ${name} (${actual.length} cases)`);
    continue;
  }
  const expected = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  actual.forEach((got, i) => {
    const want = expected[i];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures++;
      console.error(`FAIL ${name}: ${got.name}`);
      console.error(`  expected ${JSON.stringify(want)}`);
      console.error(`  actual   ${JSON.stringify(got)}`);
    }
  });
  if (actual.length !== expected.length) {
    failures++;
    console.error(`FAIL ${name}: case count ${actual.length} != recorded ${expected.length}`);
  }
  console.log(`${name}: ${actual.length} cases checked`);
}
if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
