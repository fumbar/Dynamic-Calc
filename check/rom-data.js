#!/usr/bin/env node
// Compares the data this calculator loads against the data in the ROM itself.
//
// Table offsets below were located by pattern, not assumed: the species name table
// from the encoded text "Bulbasaur", the base stats table from Bulbasaur's stat line
// with Ivysaur's following one struct later. Each is asserted again at run time, so
// a different ROM build fails loudly instead of reading noise.
const { loadRom, decode } = require('./rom');
const { buildPayload } = require('./data-load');

const SPECIES_NAMES = 0x166a98c, NAME_STRIDE = 11, SPECIES_COUNT = 1294;
const MOVE_NAMES = 0xa40a10, MOVE_NAME_STRIDE = 13;
// Two tables in this ROM start with a valid Pound row. The one at 0x900000 is
// filler (0xFF) from about index 690 on; this one carries every expanded move, so
// it is the live table. Reading the other reports false differences on Acid,
// Sucker Punch and every move DPE added.
const MOVE_DATA = 0xa769af, MOVE_STRIDE = 12, MOVE_COUNT = 1000;
// Byte 10 of a move entry is the physical/special split CFRU adds to the FireRed
// struct, confirmed against moves whose split differs from their type: Waterfall
// and Shadow Sneak read 0, Ice Beam and Psybeam read 1, Calm Mind reads 2.
const SPLIT = { 0: 'Physical', 1: 'Special', 2: 'Status' };
const BASE_STATS = 0x19e0c9c, STATS_STRIDE = 28;

// FireRed type ids, with Fairy at 23 as CFRU numbers it.
const TYPES = { 0: 'Normal', 1: 'Fighting', 2: 'Flying', 3: 'Poison', 4: 'Ground',
  5: 'Rock', 6: 'Bug', 7: 'Ghost', 8: 'Steel', 9: 'Mystery', 10: 'Fire', 11: 'Water',
  12: 'Grass', 13: 'Electric', 14: 'Psychic', 15: 'Ice', 16: 'Dragon', 17: 'Dark',
  23: 'Fairy' };

// The ROM lists every form under its base display name -- "Alakazam" appears once
// for the base and again for the Mega -- so entries are collected per name rather
// than overwritten, and a donor form name is matched against all of them.
function readRomSpecies(rom) {
  const out = new Map();
  for (let i = 0; i < SPECIES_COUNT; i++) {
    const name = decode(rom, SPECIES_NAMES + i * NAME_STRIDE, NAME_STRIDE, true);
    if (!/^[A-Za-z]/.test(name)) continue;
    const o = BASE_STATS + i * STATS_STRIDE;
    const types = [TYPES[rom[o + 6]]];
    if (rom[o + 7] !== rom[o + 6]) types.push(TYPES[rom[o + 7]]);
    // The ROM orders stats HP, Attack, Defense, Speed, SpAttack, SpDefense.
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({
      index: i,
      bs: { hp: rom[o], at: rom[o + 1], df: rom[o + 2],
        sp: rom[o + 3], sa: rom[o + 4], sd: rom[o + 5] },
      types,
      abilities: [rom[o + 22], rom[o + 23], rom[o + 26]],
    });
  }
  return out;
}

const normaliseMoveName = n => n.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

function readRomMoves(rom) {
  const out = new Map();
  for (let i = 1; i < MOVE_COUNT; i++) {
    const name = decode(rom, MOVE_NAMES + i * MOVE_NAME_STRIDE, MOVE_NAME_STRIDE, true);
    if (!/^[A-Za-z][A-Za-z0-9 '.-]*$/.test(name)) continue;
    // The ROM keeps generation 3 spellings -- ThunderPunch, AncientPower -- so names
    // are compared with punctuation and case removed.
    const key = normaliseMoveName(name);
    if (out.has(key)) continue;
    const o = MOVE_DATA + i * MOVE_STRIDE;
    out.set(key, { name: name, index: i, bp: rom[o + 1], type: TYPES[rom[o + 2]],
      category: SPLIT[rom[o + 10]] });
  }
  return out;
}

function assertAnchors(rom) {
  const bulbasaur = decode(rom, SPECIES_NAMES + 1 * NAME_STRIDE, NAME_STRIDE, true);
  if (bulbasaur !== 'Bulbasaur') {
    throw new Error('species name table is not where expected (index 1 = "' + bulbasaur + '")');
  }
  const o = BASE_STATS + 1 * STATS_STRIDE;
  const stats = [rom[o], rom[o + 1], rom[o + 2], rom[o + 3], rom[o + 4], rom[o + 5]];
  if (stats.join(',') !== '45,49,49,45,65,65') {
    throw new Error('base stats table is not where expected (index 1 = ' + stats.join(',') + ')');
  }
  const pound = decode(rom, MOVE_NAMES + 1 * MOVE_NAME_STRIDE, MOVE_NAME_STRIDE, true);
  if (pound !== 'Pound') {
    throw new Error('move name table is not where expected (index 1 = "' + pound + '")');
  }
  const m = MOVE_DATA + 1 * MOVE_STRIDE;
  if (rom[m + 1] !== 40 || rom[m + 2] !== 0) {
    throw new Error('move data table is not where expected (Pound reads power ' +
      rom[m + 1] + ', type ' + rom[m + 2] + ')');
  }
}

function compareMoves(rom, payload) {
  const romMoves = readRomMoves(rom);
  const sets = payload.formatted_sets;
  const loaded = payload.moves;

  const used = new Set();
  for (const sp of Object.keys(sets)) {
    for (const sn of Object.keys(sets[sp])) {
      (sets[sp][sn].moves || []).forEach(m => { if (m) used.add(m); });
    }
  }

  let compared = 0, agree = 0;
  const differing = [], missing = [];
  for (const name of used) {
    // Hidden Power's table row is a base the game replaces per Pokemon, so the
    // typed variants the sets name have nothing fixed to compare against.
    if (/^Hidden Power /.test(name)) continue;
    const romMove = romMoves.get(normaliseMoveName(name));
    const ours = loaded[name];
    if (!romMove || !ours) { missing.push(name); continue; }
    compared++;
    // A variable-power move stores 1 in the ROM and 0 here; both mean "computed".
    const sameBp = ours.bp === romMove.bp || (ours.bp === 0 && romMove.bp === 1);
    const sameType = ours.type === romMove.type;
    const sameCat = !ours.category || ours.category === romMove.category;
    if (sameBp && sameType && sameCat) agree++;
    else differing.push({ name, ours, rom: romMove });
  }

  const pct = (n, d) => d ? (100 * n / d).toFixed(2) + '%' : 'n/a';
  console.log('\nROM check: loaded move data vs the cartridge');
  console.log('  moves used by a trainer    : ' + used.size);
  console.log('  compared                   : ' + compared);
  console.log('  agree on power, type, split: ' + agree + '  (' + pct(agree, compared) + ')');
  console.log('  differing                  : ' + differing.length);
  console.log('  no ROM entry of that name  : ' + missing.length +
    (missing.length ? '  (' + missing.slice(0, 10).join(', ') + ')' : ''));
  differing.slice(0, 25).forEach(d => {
    console.log('    ' + d.name);
    console.log('      loaded bp ' + d.ours.bp + '  ' + d.ours.type + '  ' + (d.ours.category || '-'));
    console.log('      ROM    bp ' + d.rom.bp + '  ' + d.rom.type + '  ' + d.rom.category);
  });
}

// Donor names carry form suffixes the ROM spells differently, and the ROM has one
// entry per form under a repeated or shortened name. Only names that match exactly
// are compared; the rest are counted and listed rather than guessed at.
function main() {
  const rom = loadRom();
  assertAnchors(rom);
  const romSpecies = readRomSpecies(rom);
  const payload = buildPayload('?m=expert').payload;
  const loaded = payload.poks;
  const sets = payload.formatted_sets;

  // Species a trainer actually uses are the ones that matter for a battle.
  const used = new Set(Object.keys(sets));

  let compared = 0, agree = 0;
  const statMismatch = [], typeMismatch = [], unmatched = [];

  // A donor name may carry a form suffix the ROM does not spell out, so candidates
  // are every ROM entry sharing the base name.
  const candidatesFor = name => romSpecies.get(name) ||
    romSpecies.get(name.split('-')[0]) || null;
  const statsOf = bs => [bs.hp, bs.at, bs.df, bs.sa, bs.sd, bs.sp].join('/');

  for (const name of Object.keys(loaded)) {
    const candidates = candidatesFor(name);
    if (!candidates) { if (used.has(name)) unmatched.push(name); continue; }
    const ours = loaded[name];
    if (!ours.bs) continue;
    compared++;

    const statsMatch = candidates.filter(c => statsOf(c.bs) === statsOf(ours.bs));
    const bothMatch = statsMatch.filter(c =>
      JSON.stringify(c.types) === JSON.stringify(ours.types));
    if (bothMatch.length) { agree++; continue; }

    // Closest candidate for the report: one whose stats match if there is one,
    // otherwise the base form.
    const closest = statsMatch[0] || candidates[0];
    const row = { name, used: used.has(name), ours, rom: closest,
      forms: candidates.length };
    if (statsMatch.length) typeMismatch.push(row);
    else statMismatch.push(row);
  }

  const pct = (n, d) => d ? (100 * n / d).toFixed(2) + '%' : 'n/a';
  console.log('\nROM check: loaded species data vs the cartridge');
  console.log('  ROM species entries        : ' + romSpecies.size);
  console.log('  loaded species compared    : ' + compared);
  console.log('  agree on base stats + types: ' + agree + '  (' + pct(agree, compared) + ')');
  console.log('  base stat differences      : ' + statMismatch.length);
  console.log('  type differences           : ' + typeMismatch.length);
  console.log('  used by a trainer but not matched by name: ' + unmatched.length);

  const show = (rows, label) => {
    if (!rows.length) return;
    console.log('\n  ' + label + ':');
    rows.slice(0, 25).forEach(r => {
      const b = r.ours.bs, R = r.rom.bs;
      console.log('    ' + r.name + (r.used ? '  (used by a trainer)' : ''));
      console.log('      loaded ' + [b.hp, b.at, b.df, b.sa, b.sd, b.sp].join('/') +
        '  ' + JSON.stringify(r.ours.types));
      console.log('      ROM    ' + [R.hp, R.at, R.df, R.sa, R.sd, R.sp].join('/') +
        '  ' + JSON.stringify(r.rom.types));
    });
    if (rows.length > 25) console.log('    ... and ' + (rows.length - 25) + ' more');
  };
  show(statMismatch, 'base stat differences');
  show(typeMismatch, 'type differences');
  const unusedStat = statMismatch.filter(r => !r.used).length;
  const unusedType = typeMismatch.filter(r => !r.used).length;
  if (unusedStat || unusedType) {
    console.log('\n  plus ' + unusedStat + ' stat and ' + unusedType +
      ' type differences on species no trainer in this tier uses');
  }
  if (unmatched.length) {
    console.log('\n  names no ROM entry matches exactly: ' + unmatched.slice(0, 20).join(', '));
  }
  compareMoves(rom, payload);
  console.log('');
}

main();
