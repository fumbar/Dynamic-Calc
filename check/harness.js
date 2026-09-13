// Loads the calculator exactly as index.html does: the same calc/* files, in the
// same order, through the same shared `exports` object and path-ignoring require()
// shim. This matters because gen78.js asks for "./custom/util" but the page only
// ever loads calc/mechanics/util.js -- so the helpers this harness exercises are
// the ones the browser actually runs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Donor B, the SkiDY Unbound mirror, so ported mechanics can be compared against
// their source with identical inputs.
const DONOR_B = 'D:/antigrav-projs/unbound-calc-reference';

function browserScriptList(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="(\.\/[^"?]+)[^"]*"/g)].map(m => m[1]);
  return srcs.filter(s => s.startsWith('./calc/'));
}

// `query` is the page's query string; calc/mechanics/util.js reads dmgGen from it,
// so it is the real source of damageGen rather than the global set below.
function load({ query = '?gen=8&dmgGen=8&types=6', globals = {}, root = ROOT } = {}) {
  const sandbox = {
    console,
    URLSearchParams,
    window: { location: { search: query, hostname: 'localhost', href: 'http://localhost/index.html' + query } },
    // App globals the calc files read directly.
    damageGen: 8,
    gen: 8,
    TITLE: 'NONE',
    mechanics: 'default',
    INC_EM: false,
    challengeMode: null,
    type_chart: 6,
    type_mod: null,
    invert: null,
    misc: null,
    FAIRY: false,
    devMode: false,
    FIELD_EFFECTS: {},
    moves: {},
    ...globals,
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  // Same two lines index.html runs before any calc script.
  vm.runInContext(
    'this.__createBinding = function(o, m, k) { o[k] = m[k]; };' +
    'var calc = exports = {};' +
    'function require() { return exports };',
    ctx,
    { filename: 'index.html:shim' }
  );

  const files = browserScriptList(root);
  for (const rel of files) {
    const file = path.join(root, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  }
  return { ctx, calc: sandbox.exports, sandbox, files };
}

module.exports = { load, browserScriptList, ROOT, DONOR_B };
