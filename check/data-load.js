// Builds the Unbound payload the page would hand to loadDataSource(), by running
// js/unbound_adapter.js and backups/unbound.js in the order index.html loads them.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function buildPayload(query = '?data=unbound&gen=8&dmgGen=8') {
  const sandbox = { console, URLSearchParams, structuredClone,
    window: { location: { search: query } } };
  const ctx = vm.createContext(sandbox);
  for (const rel of ['js/unbound_adapter.js', 'backups/unbound.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  return { payload: sandbox.backup_data, donor: sandbox.UNBOUND_DONOR, notes: sandbox.UNBOUND_NOTES, ctx };
}

module.exports = { buildPayload };
