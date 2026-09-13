#!/usr/bin/env node
// Geometry checks for the donor B layout port (css/layout-b.css).
//
// The other suites cover behaviour and say nothing about appearance, which is
// how a blanket image-rendering rule once shipped and passed all 51 UI checks.
// This one measures the page instead: it pins the values css/layout-b.css is
// supposed to produce, and prints donor B's own values beside them for context.
//
// Donor B is read-only, so its numbers are reported and never asserted. Two of
// them differ from this fork on purpose and are annotated below.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { withBrowser } = require('./browser');
const { DONOR_B } = require('./harness');

const UNBOUND = '/index.html?data=unbound&gen=8&dmgGen=8&types=6';
const LOADED = 'document.readyState === "complete"';
const WIDE = 1276;   // the owner's working width
const NARROW = 1126; // below the 1180px reflow breakpoint

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json',
};

// browser.js serves this repo; donor B needs a server of its own.
function serveDonor() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try {
        rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      } catch (e) {
        res.writeHead(400).end('bad request');
        return;
      }
      const file = path.join(DONOR_B, rel);
      fs.readFile(file, (err, body) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const PROBE = `(() => {
  const q = s => document.querySelector(s);
  const box = s => { const e = q(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const font = s => { const e = q(s); return e ? getComputedStyle(e).fontSize : null; };
  const rows = [...document.querySelectorAll('.poke-info tr')]
    .slice(0, 3).map(t => Math.round(t.getBoundingClientRect().top));
  const fieldBtn = [...document.querySelectorAll('.field-info .btn, .panel-mid .btn')]
    .find(e => e.textContent.trim() === 'Electric Terrain');
  const tile = q('.trainer-pok.pokesprite');
  return JSON.stringify({
    panelFont:   font('.panel'),
    pokeInfo:    box('.poke-info'),
    fieldInfo:   box('.field-info'),
    numberInput: (() => { const e = q('.poke-info input[type="number"]'); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { font: getComputedStyle(e).fontSize, w: Math.round(r.width), h: Math.round(r.height) }; })(),
    selectCtl:   (() => { const e = q('.poke-info select'); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { font: getComputedStyle(e).fontSize, w: Math.round(r.width), h: Math.round(r.height) }; })(),
    statPitch:   rows.length === 3 ? rows[2] - rows[1] : null,
    fieldBtnH:   fieldBtn ? Math.round(fieldBtn.getBoundingClientRect().height) : null,
    spriteRender: q('img.poke-sprite') ? getComputedStyle(q('img.poke-sprite')).imageRendering : null,
    tileRender:  tile ? getComputedStyle(tile).imageRendering : null,
    scrollW:     document.documentElement.scrollWidth,
    clientW:     document.documentElement.clientWidth,
    p1Top:       (() => { const e = q('#p1 .info-group.top'); return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
    p2Top:       (() => { const e = q('#p2 .info-group.top'); return e ? Math.round(e.getBoundingClientRect().top) : null; })(),
    p1Stats:     (() => { const e = q('#p1 .info-group.left-table'); return e ? Math.round(e.getBoundingClientRect().height) : null; })(),
    p2Stats:     (() => { const e = q('#p2 .info-group.right-table'); return e ? Math.round(e.getBoundingClientRect().height) : null; })()
  });
})()`;

let failures = 0;

function check(label, actual, expected, note) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error('FAIL ' + label +
      '\n  expected ' + JSON.stringify(expected) +
      '\n  actual   ' + JSON.stringify(actual));
  } else {
    console.log('  ok  ' + label + (note ? '   ' + note : ''));
  }
}

// The box tiles only exist once something is imported, and the sprite rule is
// scoped to the style class those tiles carry, so this import is what makes the
// pixelated assertion real rather than skipped.
const TEAM = fs.readFileSync(path.join(__dirname, '..', 'docs', 'example_box.txt'), 'utf8');

async function measure(session, url, width, withBox) {
  await session.send('Emulation.setDeviceMetricsOverride',
    { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await session.open(url, LOADED);
  await new Promise(r => setTimeout(r, 2000));
  if (withBox) {
    await session.eval('addSets(' + JSON.stringify(TEAM) + ', "Box")');
    await new Promise(r => setTimeout(r, 2000));
  }
  return JSON.parse(await session.eval(PROBE));
}

async function main() {
  const donorServer = await serveDonor();
  const donorBase = 'http://127.0.0.1:' + donorServer.address().port;

  try {
    await withBrowser(async ({ session, base }) => {
      const wide = await measure(session, base + UNBOUND, WIDE, true);
      const donor = await measure(session, donorBase + '/index.html', WIDE);

      console.log('\n# type scale and column widths at ' + WIDE + 'px');
      check('panel font is the inherited 10pt, not 18px', wide.panelFont, '13.3333px',
        '(donor B ' + donor.panelFont + ')');
      check('.poke-info is donor B\'s 30em', wide.pokeInfo.w, 400,
        '(donor B ' + (donor.pokeInfo ? donor.pokeInfo.w : '?') + ')');
      check('.field-info is donor B\'s 27.5em', wide.fieldInfo.w, 367,
        '(donor B ' + (donor.fieldInfo ? donor.fieldInfo.w : '?') + ')');

      console.log('\n# form controls follow the panel scale');
      check('number input font', wide.numberInput.font, '13.3333px',
        '(donor B ' + donor.numberInput.font + ')');
      check('number input size', [wide.numberInput.w, wide.numberInput.h], [46, 19],
        '(donor B ' + donor.numberInput.w + 'x' + donor.numberInput.h + ', 2px taller by its own padding)');
      check('select font', wide.selectCtl.font, '13.3333px',
        '(donor B ' + donor.selectCtl.font + ')');
      check('select size', [wide.selectCtl.w, wide.selectCtl.h], [70, 19],
        '(donor B ' + donor.selectCtl.w + 'x' + donor.selectCtl.h + ')');
      check('stat row pitch', wide.statPitch, 21,
        '(donor B ' + donor.statPitch + '; this fork is 2px tighter)');
      check('field button height', wide.fieldBtnH, 23,
        '(donor B ' + donor.fieldBtnH + ')');

      console.log('\n# the two panels line up');
      check('Pokemon 1 and 2 start at the same height', wide.p1Top, wide.p2Top);
      check('stat tables are the same height', wide.p1Stats, wide.p2Stats,
        '(.right-table must not be pinned to 205px)');

      console.log('\n# sprite rendering');
      // A blanket pixelated rule shipped once and no suite caught it. The panel
      // sprite must stay smoothed; the box tile must be pixelated only for the
      // 40x30 pokesprite set, never for newhd, which the same tiles downscale.
      check('panel sprite is left smoothed', wide.spriteRender, 'auto');
      check('pokesprite box tile is pixelated', wide.tileRender, 'pixelated',
        '(scoped to the 40x30 set; newhd is downscaled and must stay smooth)');

      console.log('\n# no horizontal scroll, and the narrow reflow');
      check('page fits at ' + WIDE + 'px', wide.scrollW, wide.clientW);
      const narrow = await measure(session, base + UNBOUND, NARROW);
      check('page fits at ' + NARROW + 'px', narrow.scrollW, narrow.clientW);
      check('panels still aligned at ' + NARROW + 'px', narrow.p1Top, narrow.p2Top,
        '(the <= 1180px block gives .top.opp its own margin)');
    });
  } finally {
    donorServer.close();
  }

  if (failures) {
    console.error('\n' + failures + ' failure(s)');
    process.exit(1);
  }
  console.log('\nall geometry checks passed');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
