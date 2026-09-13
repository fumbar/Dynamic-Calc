#!/usr/bin/env node
// Broad agreement measurement against donor B (the SkiDY Unbound mirror), using
// real Unbound trainer sets rather than the handful of discriminating cases in
// check/mechanics.js.
//
// Three separable things can disagree, and they are reported separately because
// only the last is this port's responsibility:
//
//   1. trainer set data   -- donor C's sets (what this fork loads) vs donor B's
//   2. species/move data  -- donor C's tables vs the Unbound values B baked in
//   3. the engine         -- same inputs, both engines, damage out
//
// Every Pokemon is built from donor C's species data via explicit overrides, so
// step 3 is not contaminated by step 2.
const fs = require('fs');
const vm = require('vm');
const { load, DONOR_B } = require('./harness');
const { buildPayload } = require('./data-load');

const TIER = process.argv[2] || 'expert';
const QUERY = '?gen=8&dmgGen=8&types=6';

const mine = load({ query: QUERY });
const donor = load({ query: QUERY, root: DONOR_B });

const payload = buildPayload('?m=' + TIER).payload;
const cSets = payload.formatted_sets;
const cPoks = payload.poks;
const cMoves = payload.moves;

const bCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(
  DONOR_B + '/js/data/sets/' + TIER + '.js', 'utf8'), bCtx);
const bSets = bCtx['SETDEX_' + TIER.toUpperCase()];
const bSpecies = donor.calc.SPECIES[8];
const bMoves = donor.calc.MOVES[8];

const stripLevel = name => name.replace(/^Lvl \d+ /, '');

// ---------------------------------------------------------------- 1. set data
function compareSets() {
  let shared = 0, identical = 0;
  const differing = [];
  for (const species of Object.keys(cSets)) {
    if (!bSets[species]) continue;
    for (const setName of Object.keys(cSets[species])) {
      const theirs = bSets[species][stripLevel(setName)];
      if (!theirs) continue;
      shared++;
      const ours = cSets[species][setName];
      const fields = ['level', 'ability', 'item', 'nature'];
      const same = fields.every(f => (ours[f] || '') === (theirs[f] || '')) &&
        JSON.stringify(ours.moves || []) === JSON.stringify(theirs.moves || []) &&
        JSON.stringify(ours.evs || {}) === JSON.stringify(theirs.evs || {});
      if (same) identical++;
      else differing.push(species + ' / ' + setName);
    }
  }
  return { shared, identical, differing };
}

// ------------------------------------------------------- 2. species/move data
function compareSpecies() {
  let shared = 0, identical = 0;
  const differing = [];
  for (const name of Object.keys(cSets)) {
    const ours = cPoks[name], theirs = bSpecies[name];
    if (!ours || !theirs || !theirs.bs) continue;
    shared++;
    const sameStats = ['hp', 'at', 'df', 'sa', 'sd', 'sp']
      .every(k => ours.bs[k] === theirs.bs[k]);
    const sameTypes = JSON.stringify(ours.types) === JSON.stringify(theirs.types);
    if (sameStats && sameTypes) identical++;
    else differing.push(name);
  }
  return { shared, identical, differing };
}

function moveAgrees(name) {
  const ours = cMoves[name], theirs = bMoves[name];
  if (!ours || !theirs) return false;
  return ours.bp === theirs.bp && ours.type === theirs.type &&
    (ours.category || '') === (theirs.category || '');
}

function compareMoves() {
  const used = new Set();
  for (const sp of Object.keys(cSets)) {
    for (const sn of Object.keys(cSets[sp])) {
      (cSets[sp][sn].moves || []).forEach(m => m && used.add(m));
    }
  }
  const differing = [...used].filter(m => !moveAgrees(m));
  return { shared: used.size, identical: used.size - differing.length, differing };
}

// ------------------------------------------------------------------ 3. engine
// "Ours" is measured in the real page, after loadDataSource has applied the title's
// data. Loading calc/* alone would compare this fork's stock tables against the
// Unbound values donor B baked in, and report data differences as engine ones.
const { withBrowser } = require('./browser');

// A neutral opponent, identical on both sides, so the trainer set is the only
// thing that varies.
const NEUTRAL = {
  species: 'Pikachu', level: 50, nature: 'Serious', ability: 'Pressure',
  overrides: { types: ['Normal'], weightkg: 60,
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } },
};
const PROBES = ['Tackle', 'Ember', 'Water Gun', 'Vine Whip'];

function setSpec(species, set, poks) {
  const pok = poks[species];
  return {
    species,
    level: set.level,
    nature: set.nature || 'Serious',
    ability: set.ability,
    item: set.item || undefined,
    evs: set.evs, ivs: set.ivs,
    moveNames: (set.moves || []).filter(Boolean),
    overrides: pok ? {
      types: pok.types,
      weightkg: pok.weightkg,
      baseStats: { hp: pok.bs.hp, atk: pok.bs.at, def: pok.bs.df,
        spa: pok.bs.sa, spd: pok.bs.sd, spe: pok.bs.sp },
    } : undefined,
  };
}

// One body, run in Node against donor B and in the page against this fork, so the
// two sides cannot drift apart.
const WORK = function (calc, sets, poks, NEUTRAL, PROBES) {
  const gen = calc.Generations.get(8);
  const out = {};
  const build = spec => {
    const p = new calc.Pokemon(gen, spec.species, spec);
    if (spec.moveNames) p.moves = spec.moveNames.map(m => new calc.Move(gen, m));
    return p;
  };
  // An engine can throw on data it cannot resolve. Record that rather than
  // abandoning the run, so one bad set does not hide the rest of the comparison.
  const dmg = (a, d, moveName) => {
    try {
      return JSON.stringify(calc.calculate(gen, build(a), build(d),
        new calc.Move(gen, moveName), new calc.Field({})).damage);
    } catch (e) {
      return 'THREW: ' + e.message;
    }
  };

  for (const species of Object.keys(sets)) {
    for (const setName of Object.keys(sets[species])) {
      const set = sets[species][setName];
      const pok = poks[species];
      if (!pok || !pok.bs) continue;
      const spec = {
        species, level: set.level, nature: set.nature || 'Serious',
        ability: set.ability, item: set.item || undefined,
        evs: set.evs, ivs: set.ivs,
        moveNames: (set.moves || []).filter(Boolean),
        overrides: { types: pok.types, weightkg: pok.weightkg,
          baseStats: { hp: pok.bs.hp, atk: pok.bs.at, def: pok.bs.df,
            spa: pok.bs.sa, spd: pok.bs.sd, spe: pok.bs.sp } },
      };
      const label = species + ' / ' + setName;
      for (const moveName of spec.moveNames) {
        out[label + 'attacking' + moveName] = dmg(spec, NEUTRAL, moveName);
      }
      for (const moveName of PROBES) {
        out[label + 'defending' + moveName] = dmg(NEUTRAL, spec, moveName);
      }
    }
  }
  return out;
};

async function measureOurs() {
  return withBrowser(async ({ session, base }) => {
    const url = base + '/index.html?data=unbound&gen=8&dmgGen=8&types=6&m=' + TIER;
    await session.open(url,
      'typeof TITLE !== "undefined" && TITLE === "Unbound 2.1.1" && ' +
      'typeof setdex === "object" && setdex !== null && backup_data.tier === "' + TIER + '"');
    return JSON.parse(await session.eval(
      'JSON.stringify((' + WORK.toString() + ')(calc, backup_data.formatted_sets,' +
      ' backup_data.poks, ' + JSON.stringify(NEUTRAL) + ', ' + JSON.stringify(PROBES) + '))'));
  });
}

function measureDonor() {
  // Donor B's own tables already hold the Unbound values, so it runs on its own data.
  return WORK(donor.calc, cSets, cPoks, NEUTRAL, PROBES);
}

// Moves where this fork deliberately differs from donor B because the ROM says the
// donors are wrong. Counted separately so the headline number stays meaningful.
const ROM_BACKED_DIVERGENCE = ['Hydro Pump', 'Aura Sphere'];

// Moves carried by an -ate ability. Both donors apply 1.3x; CFRU ships the 1.3x
// switch (OLD_ATE_BOOST) commented out, so this fork keeps CFRU's 1.2x default.
// Which one Unbound compiled is unresolved -- see docs/HANDOFF.md.
const ATE_ABILITIES = ['Aerilate', 'Pixilate', 'Refrigerate', 'Galvanize'];

function compareDamage(ours, theirs, setAbility) {
  let compared = 0, agree = 0, romBacked = 0, ateBoost = 0;
  const mismatches = [];
  for (const key of Object.keys(theirs)) {
    if (!(key in ours)) continue;
    compared++;
    if (ours[key] === theirs[key]) agree++;
    else {
      const [label, dir, moveName] = key.split('');
      if (ROM_BACKED_DIVERGENCE.indexOf(moveName) !== -1) { romBacked++; continue; }
      if (ATE_ABILITIES.indexOf(setAbility(label)) !== -1) { ateBoost++; continue; }
      mismatches.push({ label, dir, moveName, mine: ours[key], donor: theirs[key] });
    }
  }
  return { compared, agree, romBacked, ateBoost, mismatches, skippedForMoveData: [] };
}

// ------------------------------------------------------------------- report
const pct = (n, d) => d ? (100 * n / d).toFixed(2) + '%' : 'n/a';

async function main() {
console.log('\nUnbound ' + TIER + ' tier, this fork vs donor B\n');

const sets = compareSets();
console.log('1. trainer set data (donor C, which this fork loads, vs donor B)');
console.log('   sets present in both : ' + sets.shared);
console.log('   identical            : ' + sets.identical + '  (' + pct(sets.identical, sets.shared) + ')');
if (sets.differing.length) {
  console.log('   differing            : ' + sets.differing.length);
  sets.differing.slice(0, 10).forEach(d => console.log('     - ' + d));
  if (sets.differing.length > 10) console.log('     ... and ' + (sets.differing.length - 10) + ' more');
}

const species = compareSpecies();
console.log('\n2a. species data (base stats and types)');
console.log('   species in both      : ' + species.shared);
console.log('   identical            : ' + species.identical + '  (' + pct(species.identical, species.shared) + ')');
species.differing.slice(0, 10).forEach(d => console.log('     - ' + d));
if (species.differing.length > 10) console.log('     ... and ' + (species.differing.length - 10) + ' more');

const moves = compareMoves();
console.log('\n2b. move data (base power, type, category) for moves the sets use');
console.log('   moves used           : ' + moves.shared);
console.log('   identical            : ' + moves.identical + '  (' + pct(moves.identical, moves.shared) + ')');
moves.differing.slice(0, 10).forEach(d => console.log('     - ' + d));
if (moves.differing.length > 10) console.log('     ... and ' + (moves.differing.length - 10) + ' more');

const abilityOf = label => {
  const parts = label.split(' / ');
  return ((cSets[parts[0]] || {})[parts[1]] || {}).ability || '';
};
const dmg = compareDamage(await measureOurs(), measureDonor(), abilityOf);
console.log('\n3. ENGINE: same inputs, both engines, damage compared');
console.log('   comparisons          : ' + dmg.compared);
console.log('   agree                : ' + dmg.agree + '  (' + pct(dmg.agree, dmg.compared) + ')');
console.log('   differ, ROM-backed   : ' + dmg.romBacked +
  '  (this fork follows the ROM where the donors are wrong)');
console.log('   differ, -ate boost   : ' + dmg.ateBoost +
  '  (CFRU default 1.2x vs the donors 1.3x, unresolved)');
console.log('   disagree             : ' + dmg.mismatches.length);
  const threwHere = dmg.mismatches.filter(m => String(m.mine).indexOf('THREW') === 0).length;
  const threwDonor = dmg.mismatches.filter(m => String(m.donor).indexOf('THREW') === 0).length;
  console.log('     this fork threw      : ' + threwHere);
  console.log('     donor B threw        : ' + threwDonor);
console.log('   skipped, move data differs : ' + dmg.skippedForMoveData.length);

if (dmg.mismatches.length) {
  const byMove = {};
  dmg.mismatches.forEach(m => { byMove[m.moveName] = (byMove[m.moveName] || 0) + 1; });
  console.log('\n   disagreements by move:');
  Object.entries(byMove).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([m, n]) => console.log('     ' + String(n).padStart(4) + '  ' + m));
  console.log('\n   every disagreement, with the set ability and item:');
  const ourAbilities = new Set(mine.calc.ABILITIES[8]);
  const theirAbilities = new Set(donor.calc.ABILITIES[8]);
  dmg.mismatches.forEach(m => {
    const parts = m.label.split(' / ');
    const set = (cSets[parts[0]] || {})[parts[1]] || {};
    const ab = set.ability || '';
    const known = (ourAbilities.has(ab) ? 'here' : '-') + '/' +
      (theirAbilities.has(ab) ? 'donor' : '-');
    console.log('     ' + m.label);
    console.log('       ' + m.dir + ' ' + m.moveName + '  ability=' + ab +
      ' [' + known + ']  item=' + (set.item || '-'));
    console.log('       here  ' + m.mine);
    console.log('       donor ' + m.donor);
  });
}
console.log('');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
