#!/usr/bin/env node
// Browser checks for the Unbound integration. Every page load must finish clean:
// an uncaught exception or a console error fails the check, except the one
// pre-existing 404 below, which this merge did not introduce.
const { withBrowser } = require('./browser');

// index.html references js/console_watcher.js, which is not in the repository.
// Present on master too; unrelated to this merge.
const KNOWN_PROBLEMS = [/console_watcher\.js/, /favicon\.ico/];

const UNBOUND = '/index.html?data=unbound&gen=8&dmgGen=8&types=6&customPoks=1';
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
