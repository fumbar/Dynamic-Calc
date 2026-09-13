#!/usr/bin/env node
// Checks each ported Unbound effect two ways: it must change the result on a case
// chosen to discriminate it, and it must agree with donor B (the SkiDY Unbound
// mirror) given identical inputs.
//
// Every case states base stats, types and weight explicitly, so the two engines are
// compared on the same numbers rather than on whatever their own dex happens to hold.
const { load, ROOT, DONOR_B } = require('./harness');

const QUERY = '?gen=8&dmgGen=8&types=6';

// Explicit species data, so neither engine's dex affects the comparison.
const MONS = {
  attacker: { types: ['Water'], baseStats: { hp: 100, atk: 120, def: 90, spa: 120, spd: 90, spe: 100 }, weightkg: 50 },
  ghost: { types: ['Ghost'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 40 },
  normal: { types: ['Normal'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 40 },
  ground: { types: ['Ground'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 40 },
  rock: { types: ['Rock'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 40 },
  // Same Speed, very different weight: only Big Mo should separate these.
  heavy: { types: ['Steel'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 400 },
  light: { types: ['Steel'], baseStats: { hp: 100, atk: 80, def: 90, spa: 80, spd: 90, spe: 80 }, weightkg: 4 },
};

function mon(key, extra) {
  return Object.assign({ species: 'Pikachu', level: 50, nature: 'Serious',
    overrides: MONS[key] }, extra);
}

const CASES = [
  {
    name: 'vicious sandstorm: special hit on a Ground type',
    // Plain Sand boosts Rock SpD only; Vicious Sandstorm boosts Ground as well.
    attacker: mon('attacker'), defender: mon('ground'), move: 'Scald',
    off: { weather: 'Sand' }, on: { weather: 'Vicious Sandstorm' }, mustDiffer: true,
  },
  {
    name: 'vicious sandstorm: special hit on a Rock type is unchanged',
    attacker: mon('attacker'), defender: mon('rock'), move: 'Scald',
    off: { weather: 'Sand' }, on: { weather: 'Vicious Sandstorm' }, mustDiffer: false,
  },
  {
    name: 'vicious sandstorm: Sand Force applies',
    attacker: mon('attacker', { ability: 'Sand Force' }), defender: mon('normal'),
    move: 'Earthquake',
    off: {}, on: { weather: 'Vicious Sandstorm' }, mustDiffer: true,
  },
  {
    name: 'vicious sandstorm: Weather Ball becomes Rock',
    attacker: mon('attacker'), defender: mon('ground'), move: 'Weather Ball',
    off: {}, on: { weather: 'Vicious Sandstorm' }, mustDiffer: true,
  },
  {
    name: 'vicious sandstorm: Solar Beam is halved',
    attacker: mon('attacker'), defender: mon('normal'), move: 'Solar Beam',
    off: {}, on: { weather: 'Vicious Sandstorm' }, mustDiffer: true,
  },
  {
    name: 'vicious sandstorm: Sand Rush doubles Speed (via Electro Ball)',
    attacker: mon('attacker', { ability: 'Sand Rush' }), defender: mon('normal'),
    move: 'Electro Ball',
    off: { weather: 'Sand' }, on: { weather: 'Vicious Sandstorm' }, mustDiffer: false,
  },
  {
    name: 'shadowy veil: a Ghost defender takes half',
    attacker: mon('attacker'), defender: mon('ghost'), move: 'Scald',
    off: {}, on: { isShadowyVeil: true }, mustDiffer: true,
  },
  {
    name: 'shadowy veil: a non-Ghost defender is unaffected',
    attacker: mon('attacker'), defender: mon('normal'), move: 'Scald',
    off: {}, on: { isShadowyVeil: true }, mustDiffer: false,
  },
  {
    name: 'big mo: a heavy defender is slow (Electro Ball)',
    attacker: mon('attacker'), defender: mon('heavy'), move: 'Electro Ball',
    off: {}, on: { isBigMoField: true }, mustDiffer: true,
  },
  {
    name: 'big mo: a light defender is fast (Electro Ball)',
    attacker: mon('attacker'), defender: mon('light'), move: 'Electro Ball',
    off: {}, on: { isBigMoField: true }, mustDiffer: true,
  },
  {
    name: 'camomons: types follow the first two moves',
    // A Normal-typed defender whose moves are Water and Flying becomes Water/Flying,
    // which takes Thunderbolt for 4x instead of 1x.
    attacker: mon('attacker'), defender: mon('normal', { moves: ['Surf', 'Fly', 'Tackle', 'Tackle'] }),
    move: 'Discharge',
    off: {}, on: { isCamomonsBattle: true }, mustDiffer: true, camomonsInDonorUI: true,
  },
  {
    name: 'camomons: attacker STAB follows its first move',
    attacker: mon('attacker', { moves: ['Discharge', 'Discharge', 'Tackle', 'Tackle'] }),
    defender: mon('normal'), move: 'Discharge',
    off: {}, on: { isCamomonsBattle: true }, mustDiffer: true, camomonsInDonorUI: true,
  },
];

// `typesFromMoves` reproduces donor B's Camomons, which it implements in the UI by
// writing the first two move types into the type selects rather than in the engine.
// Comparing the flag against B's engine would only prove B ignores it.
function runCase(engine, c, fieldOpts, typesFromMoves) {
  const { calc } = engine;
  const { Generations, Pokemon, Move, Field, calculate } = calc;
  const gen = Generations.get(8);
  const build = spec => {
    let overrides = spec.overrides;
    if (typesFromMoves && spec.moves) {
      const types = [];
      spec.moves.slice(0, 2).forEach(m => {
        const t = new Move(gen, m).type;
        if (types.indexOf(t) === -1) types.push(t);
      });
      overrides = Object.assign({}, overrides, { types });
    }
    const p = new Pokemon(gen, spec.species, Object.assign({}, spec, { overrides }));
    if (spec.moves) p.moves = spec.moves.map(m => new Move(gen, m));
    return p;
  };
  // Cases use moves whose stock base power is the same in both engines (Scald,
  // Discharge, Earthquake). Donor B's calculate() re-clones the move from its own
  // table, so a base power set on the instance would not survive the comparison.
  const move = new Move(gen, c.move);
  const result = calculate(gen, build(c.attacker), build(c.defender), move, new Field(fieldOpts));
  return Array.isArray(result.damage) ? result.damage : [result.damage];
}

const mine = load({ query: QUERY });
const donor = load({ query: QUERY, root: DONOR_B });

let failures = 0;
function fail(msg) { failures++; console.error('FAIL ' + msg); }

for (const c of CASES) {
  const off = runCase(mine, c, c.off);
  const on = runCase(mine, c, Object.assign({}, c.off, c.on));
  const differs = JSON.stringify(off) !== JSON.stringify(on);

  if (differs !== c.mustDiffer) {
    fail(c.name + ': effect ' + (c.mustDiffer ? 'did not change' : 'unexpectedly changed') +
      ' the result\n  off ' + JSON.stringify(off) + '\n  on  ' + JSON.stringify(on));
    continue;
  }

  const donorField = c.camomonsInDonorUI
    ? Object.assign({}, c.off)
    : Object.assign({}, c.off, c.on);
  const donorOn = runCase(donor, c, donorField, c.camomonsInDonorUI);
  if (JSON.stringify(on) !== JSON.stringify(donorOn)) {
    fail(c.name + ': disagrees with donor B\n  here  ' + JSON.stringify(on) +
      '\n  donor ' + JSON.stringify(donorOn));
    continue;
  }
  console.log('  ok  ' + c.name + (c.mustDiffer ? '' : ' (no change, as expected)'));
}

// Inverse battle is A's own, not a port. Confirm it is present and discriminating
// rather than adding a second implementation.
{
  const c = {
    attacker: mon('attacker'), defender: mon('ground'), move: 'Thunderbolt',
  };
  const off = runCase(mine, c, {});
  const on = runCase(mine, c, { isInverseBattle: true });
  if (off[0] !== 0 || on[0] === 0) {
    fail('inverse battle: expected an immunity that inverts to damage, got ' +
      JSON.stringify(off) + ' / ' + JSON.stringify(on));
  } else {
    console.log('  ok  inverse battle: existing implementation still inverts immunity');
  }
}

if (failures) { console.error('\n' + failures + ' failure(s)'); process.exit(1); }
console.log('\nall mechanics checks passed');
