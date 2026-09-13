#!/usr/bin/env node
// Browser checks for the Unbound integration. Every page load must finish clean:
// an uncaught exception or a console error fails the check, except the one
// pre-existing 404 below, which this merge did not introduce.
const { withBrowser } = require('./browser');

// index.html references js/console_watcher.js, which is not in the repository.
// Present on master too; unrelated to this merge.
const KNOWN_PROBLEMS = [/console_watcher\.js/, /favicon\.ico/];

const UNBOUND = '/index.html?data=unbound&gen=8&dmgGen=8&types=6';
const RENPLAT = '/index.html?data=26138cc1d500b0cf7334&dmgGen=4&gen=7&switchIn=4&types=6';
const LOADED = 'typeof TITLE !== "undefined" && typeof setdex === "object" && setdex !== null';

let failures = 0;

function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error('FAIL ' + label +
      '\n  expected ' + JSON.stringify(expected) +
      '\n  actual   ' + JSON.stringify(actual));
  } else {
    console.log('  ok  ' + label);
  }
}

function checkClean(label, problems) {
  const unexpected = problems.filter(p => !KNOWN_PROBLEMS.some(k => k.test(p)));
  check(label + ': page loaded without errors', unexpected, []);
}

async function main() {
  await withBrowser(async ({ session, base }) => {
    const open = (url, extra) =>
      session.open(base + url, LOADED + (extra ? ' && ' + extra : ''));

    console.log('\n# tiers');
    const tiers = [['difficult', 223, 355], ['expert', 240, 380], ['insane', 265, 415]];
    for (const [tier, species, sets] of tiers) {
      await open(UNBOUND + '&m=' + tier);
      checkClean(tier, session.problems);
      check(tier + ': title', await session.eval('TITLE'), 'Unbound 2.1.1');
      check(tier + ': species in collection',
        await session.eval('Object.keys(setdex).length'), species);
      check(tier + ': trainer sets', await session.eval(
        'Object.values(setdex).reduce(function (n, s) { return n + Object.keys(s).length; }, 0)'),
        sets);
      check(tier + ': selector shows the loaded tier',
        await session.eval('document.querySelector("#tier-select").value'), tier);
    }

    console.log('\n# tier fallback');
    await open(UNBOUND + '&m=nightmare');
    check('unknown tier falls back to expert',
      await session.eval('document.querySelector("#tier-select").value'), 'expert');
    check('unknown tier loads expert data',
      await session.eval('Object.keys(setdex).length'), 240);
    await open(UNBOUND);
    check('absent tier defaults to expert',
      await session.eval('document.querySelector("#tier-select").value'), 'expert');

    console.log('\n# data seams');
    check('quarantined species are not selectable', await session.eval(
      'JSON.stringify(["Supply and Demand", "Rogue Electivire", "[2nd"]' +
      '.filter(function (k) { return k in setdex; }))'), '[]');
    check('every set move resolves in the move table', await session.eval(
      'JSON.stringify(Object.keys(Object.values(setdex)' +
      '.reduce(function (acc, s) {' +
      '  Object.values(s).forEach(function (set) {' +
      '    (set.moves || []).forEach(function (m) { if (m && !moves[m]) acc[m] = 1; });' +
      '  }); return acc; }, {})))'), '[]');
    check('aliased move names reach the move table', await session.eval(
      'JSON.stringify([!!moves["Discharge"], !!moves["Freeze-Dry"],' +
      ' !!moves["Thunder Punch"], !!moves["DIscharge"], !!moves["Freeze Dry"]])'),
      '[true,true,true,false,false]');
    check('custom species created from donor data', await session.eval(
      'JSON.stringify(pokedex["Shadow-Warrior"] && pokedex["Shadow-Warrior"].types)'),
      '["Ghost","Dark"]');

    console.log('\n# UI and engine agree');
    check('base stats: pokedex matches the engine lookup', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  return JSON.stringify(["Liepard", "Krookodile", "Zapdos"].map(function (n) {' +
      '    var ui = pokedex[n].bs, e = gen.species.get(n.toLowerCase()).baseStats;' +
      '    return ui.hp === e.hp && ui.at === e.atk && ui.df === e.def &&' +
      '           ui.sa === e.spa && ui.sd === e.spd && ui.sp === e.spe;' +
      '  }));' +
      '})()'), '[true,true,true]');
    check('weightkg and nfe reach the engine', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  var d = gen.species.get("dusclops"), k = gen.species.get("krookodile");' +
      '  return JSON.stringify([d.nfe, pokedex["Dusclops"].nfe,' +
      '    d.weightkg === pokedex["Dusclops"].weightkg,' +
      '    k.weightkg === pokedex["Krookodile"].weightkg]);' +
      '})()'), '[true,true,true,true]');

    console.log('\n# isolation');
    check('working tables are not the stock objects', await session.eval(
      'JSON.stringify([pokedex !== calc.SPECIES[8], moves !== calc.MOVES[9]])'), '[true,true]');
    check('stock base stats survive the title load', await session.eval(
      'JSON.stringify([calc.SPECIES[8]["Liepard"].bs.at, pokedex["Liepard"].bs.at])'), '[98,88]');
    check('working tables do not alias donor data', await session.eval(
      'JSON.stringify([pokedex["Liepard"] !== UNBOUND_DONOR.pokedex["Liepard"],' +
      ' setdex["Zapdos"] !== UNBOUND_DONOR.formatted_sets.expert["Zapdos"]])'), '[true,true]');

    console.log('\n# representative Expert battle');
    check('Shadow Admin Marlon2 team, in order', await session.eval(
      'JSON.stringify(Object.keys(setdex).reduce(function (out, sp) {' +
      '  Object.keys(setdex[sp]).forEach(function (sn) {' +
      '    if (sn.indexOf("Shadow Admin Marlon2") === -1) return;' +
      '    var s = setdex[sp][sn];' +
      '    out.push([sp, s.level, s.ability, s.item, (s.moves || []).join("/")]);' +
      '  }); return out; }, []))'),
      JSON.stringify([
        ['Swoobat', 39, 'Simple', 'Scope Lens', 'Esper Wing/Air Slash/Shadow Ball/Calm Mind'],
        ['Zapdos', 40, 'Pressure', '', 'Discharge/Hurricane/Ancient Power/Light Screen'],
        ['Dusclops', 40, 'Pressure', 'Eviolite', 'Night Shade/Ice Punch/Confuse Ray/Will-O-Wisp'],
        ['Sharpedo-Mega', 40, 'Strong Jaw', 'Sharpedonite', 'Aqua Jet/Crunch/Poison Fang/Ice Fang'],
        ['Krookodile', 41, 'Intimidate', '', 'Stomping Tantrum/Crunch/Stone Edge/Power-Up Punch'],
      ]));

    console.log('\n# tier control and box');
    await session.eval(
      'localStorage.setItem("customsets", JSON.stringify(' +
      '{"Pikachu": {"box test": {"level": 50, "moves": ["Thunderbolt", "", "", ""]}}}))');
    session.problems = [];
    await session.eval(
      'document.querySelector("#tier-select").value = "insane";' +
      '$("#tier-select").trigger("change")');
    // The control navigates on its own; do not navigate over it.
    await session.waitFor(
      'new URLSearchParams(location.search).get("m") === "insane" && ' +
      LOADED + ' && backup_data.tier === "insane"');
    check('tier control navigated to the chosen tier',
      await session.eval('new URLSearchParams(location.search).get("m")'), 'insane');
    // updateDex() merges the box into the loaded collection, so the count here is
    // the insane tier's 265 species plus the one box species.
    check('tier control loaded the insane collection',
      await session.eval('Object.keys(setdex).length'), 266);
    check('imported box survives the tier change', await session.eval(
      'JSON.stringify(Object.keys(JSON.parse(localStorage.customsets)))'), '["Pikachu"]');
    check('box set is selectable alongside the tier data', await session.eval(
      'JSON.stringify(!!(setdex["Pikachu"] && setdex["Pikachu"]["box test"]))'), 'true');

    console.log('\n# field effects');
    await open(UNBOUND);
    check('Unbound field controls are visible', await session.eval(
      'JSON.stringify([!document.querySelector(".unbound-effects").classList.contains("gone"),' +
      ' !!document.querySelector("#vicious-sandstorm"), !!document.querySelector("#shadowyveil"),' +
      ' !!document.querySelector("#bigmo"), !!document.querySelector("#camomons")])'),
      '[true,true,true,true,true]');
    check('createField carries the flags to the engine', await session.eval(
      '(function () {' +
      '  $("#shadowyveil").prop("checked", true);' +
      '  $("#bigmo").prop("checked", true);' +
      '  $("#camomons").prop("checked", true);' +
      '  $("#vicious-sandstorm").prop("checked", true);' +
      '  var f = createField();' +
      '  $("#shadowyveil, #bigmo, #camomons, #vicious-sandstorm").prop("checked", false);' +
      '  return JSON.stringify([f.isShadowyVeil, f.isBigMoField, f.isCamomonsBattle, f.weather]);' +
      '})()'), '[true,true,true,"Vicious Sandstorm"]');
    check('a field toggle changes the calculated damage', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  var ghost = new calc.Pokemon(gen, "Gengar", { level: 50 });' +
      '  var hitter = new calc.Pokemon(gen, "Blastoise", { level: 50 });' +
      '  var move = new calc.Move(gen, "Surf");' +
      '  var off = calc.calculate(gen, hitter, ghost, move, new calc.Field({}));' +
      '  var on = calc.calculate(gen, hitter, ghost, move, new calc.Field({ isShadowyVeil: true }));' +
      '  return JSON.stringify(off.damage) !== JSON.stringify(on.damage);' +
      '})()'), true);
    check('Unbound base power reaches the UI and the engine', await session.eval(
      'JSON.stringify([moves["Surf"].bp,' +
      ' calc.Generations.get(8).moves.get("surf").basePower,' +
      ' new calc.Move(calc.Generations.get(8), "Surf").bp])'), '[95,95,95]');

    console.log('\n# donor data the stock tables cannot resolve');
    await open(UNBOUND);
    // The ability selector is rebuilt after the title's data lands, so wait for it
    // rather than racing the rebuild.
    await session.waitFor(
      'Array.prototype.some.call(document.querySelectorAll("#p2 .ability option"),' +
      ' function (o) { return o.value === "Multieye"; })');
    // Unbound ability names are not in the stock list, so the selector could not hold
    // them and the calculation silently ran with whatever it fell back to.
    check('Unbound abilities are selectable', await session.eval(
      '(function () {' +
      '  var s = document.querySelector("#p2 .ability");' +
      '  return JSON.stringify(["Multieye", "Portal Power", "Icy Skin", "Bellow",' +
      '    "Sound Waves"].map(function (a) { s.value = a; return s.value === a; }));' +
      '})()'), '[true,true,true,true,true]');
    check('ported Unbound abilities change the result', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  var hit = new calc.Pokemon(gen, "Blastoise", { level: 50 });' +
      '  var d = function (ability) {' +
      '    return JSON.stringify(calc.calculate(gen, hit,' +
      '      new calc.Pokemon(gen, "Claydol", { level: 50, ability: ability }),' +
      '      new calc.Move(gen, "Surf"), new calc.Field({})).damage);' +
      '  };' +
      '  return d("Levitate") !== d("Multieye");' +
      '})()'), true);
    // A set naming an item or nature no table knows used to throw, taking the page down.
    check('an unresolvable nature does not throw', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  try {' +
      '    calc.calculate(gen, new calc.Pokemon(gen, "Miltank", { level: 36, nature: "72" }),' +
      '      new calc.Pokemon(gen, "Blastoise", { level: 50 }),' +
      '      new calc.Move(gen, "Facade"), new calc.Field({}));' +
      '    return "ok";' +
      '  } catch (e) { return "threw: " + e.message; }' +
      '})()'), 'ok');
    check('Knock Off against an unknown item does not throw', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  try {' +
      '    calc.calculate(gen, new calc.Pokemon(gen, "Blastoise", { level: 50 }),' +
      '      new calc.Pokemon(gen, "Houndoom", { level: 50, item: "Not An Item" }),' +
      '      new calc.Move(gen, "Knock Off"), new calc.Field({}));' +
      '    return "ok";' +
      '  } catch (e) { return "threw: " + e.message; }' +
      '})()'), 'ok');
    check('corrected item names resolve', await session.eval(
      'JSON.stringify(["Houndoominite", "Kangaskhanite", "Weakness Policy", "Flyinium Z"]' +
      '.map(function (i) { return items.indexOf(i) >= 0; }))'),
      '[true,true,true,true]');
    // Donor data supplies isPunch on Wicked Blow; the engine reads flags.punch.
    check('supplied move flags reach the engine flag names', await session.eval(
      'JSON.stringify([calc.Generations.get(8).moves.get("wickedblow").flags.punch,' +
      ' calc.Generations.get(8).moves.get("leechfang").flags.bite])'), '[1,1]');

    // ROM-sourced corrections: both donors carry the generation 6 values here, the
    // cartridge carries the older ones. See check/rom-data.js.
    check('ROM base powers are applied', await session.eval(
      'JSON.stringify([moves["Hydro Pump"].bp, moves["Aura Sphere"].bp,' +
      ' moves["Surf"].bp, moves["Sucker Punch"].bp])'), '[120,90,95,70]');

    console.log('\n# text import');
    // A real Unbound Cloud box export from the owner's playthrough
    // (docs/example_box.txt): 18 Pokemon, 17 species, nicknames, and one species
    // that appears twice.
    const TEAM = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'docs', 'example_box.txt'), 'utf8');
    const boxDump = '(function () {' +
      '  var d = JSON.parse(localStorage.customsets || "{}"), o = [];' +
      '  for (var k in d) for (var s in d[k]) o.push(k + "|" + s + "|" + d[k][s].level);' +
      '  return JSON.stringify(o.sort());' +
      '})()';

    await open(UNBOUND);
    await session.eval('localStorage.removeItem("customsets")');
    await open(UNBOUND);
    await session.eval('addSets(' + JSON.stringify(TEAM) + ', "Box")');
    const imported = JSON.parse(await session.eval(boxDump));
    check('every Pokemon in the box is imported', imported.length, 18);
    check('imported species are all selectable', await session.eval(
      '(function () {' +
      '  var d = JSON.parse(localStorage.customsets || "{}");' +
      '  return JSON.stringify(Object.keys(d).filter(function (k) { return !setdex[k]; }));' +
      '})()'), '[]');
    // A nickname that is also a species name used to import a second, wrong set.
    check('a nicknamed form imports once, as the form', await session.eval(
      '(function () {' +
      '  var d = JSON.parse(localStorage.customsets || "{}");' +
      '  return JSON.stringify([!!d["Zygarde-10%"], !!d["Zygarde"]]);' +
      '})()'), '[true,false]');
    // Two Pyroar used to collapse into one, the second overwriting the first.
    check('a species held twice keeps both entries',
      imported.filter(r => r.indexOf('Pyroar|') === 0).sort(),
      ['Pyroar|My Box 2|40', 'Pyroar|My Box|36']);
    await session.eval('addSets(' + JSON.stringify(TEAM) + ', "Box")');
    check('an identical re-import does not accumulate entries',
      JSON.parse(await session.eval(boxDump)).length, 18);
    check('an imported Pokemon calculates off Unbound base stats', await session.eval(
      '(function () {' +
      '  var gen = calc.Generations.get(8);' +
      '  var trev = new calc.Pokemon(gen, "Trevenant", { level: 50 });' +
      '  return JSON.stringify([trev.species.baseStats.atk, trev.rawStats.atk]);' +
      '})()'),
      // Unbound gives Trevenant 110 base Attack, not the stock 120; at level 50 with
      // no EVs that is 130 rather than 140.
      '[110,130]');

    console.log('\n# another title still loads');
    await session.open(base + RENPLAT, LOADED + ' && TITLE === "Renegade Platinum"');
    checkClean('Renegade Platinum', session.problems);
    check('Renegade Platinum loaded its own sets',
      await session.eval('Object.keys(setdex).length > 100'), true);
    check('Renegade Platinum shows no tier selector', await session.eval(
      'document.querySelector("#tier-select").classList.contains("gone")'), true);
  });

  if (failures) {
    console.error('\n' + failures + ' failure(s)');
    process.exit(1);
  }
  console.log('\nall browser checks passed');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
