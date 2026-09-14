// Focused regressions from the first-build review; no ROM or broad trainer sweep.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, DONOR_B } = require('./harness');
const { withBrowser } = require('./browser');

function liquidVoiceDamage(engine) {
  const { calc } = engine;
  const gen = calc.Generations.get(8);
  const overrides = { types: ['Water'], weightkg: 50,
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } };
  return Array.from(calc.calculate(gen,
    new calc.Pokemon(gen, 'Primarina', { level: 50, ability: 'Liquid Voice', overrides }),
    new calc.Pokemon(gen, 'Blastoise', { level: 50, ability: 'Torrent', overrides }),
    new calc.Move(gen, 'Hyper Voice'), new calc.Field()).damage);
}

async function main() {
  const legacy = liquidVoiceDamage(load());
  assert.deepEqual(legacy, liquidVoiceDamage(load({ globals: { LIQUID_VOICE_NO_BOOST: false } })));
  const unbound = liquidVoiceDamage(load({ globals: { LIQUID_VOICE_NO_BOOST: true } }));
  assert.deepEqual(unbound, liquidVoiceDamage(load({ root: DONOR_B })));
  assert.ok(legacy[0] > unbound[0], 'case must expose the inherited boosts');
  console.log('ok: Liquid Voice matches donor B with the opt-in; legacy behavior remains');

  await withBrowser(async ({ session, base }) => {
    const url = base + '/index.html?data=unbound&gen=8&dmgGen=8&types=6';
    await session.open(url, 'typeof performCalculations === "function" && typeof setdex === "object" && setdex && typeof UNBOUND_DONOR === "object"');
    await session.waitFor('$("#p1 .move1 .move-selector option").length > 100');
    assert.equal(await session.eval('LIQUID_VOICE_NO_BOOST'), true);
    const team = fs.readFileSync(path.join(__dirname, '../docs/example_box.txt'), 'utf8');
    // The duplicate box actions below need a species held twice, which the owner's box
    // no longer is, so a second Pyroar joins the same paste. The export names the
    // species in brackets after a nickname, and the file ends without a trailing
    // newline, hence the separator. Its first move carries the assertion below.
    const secondPyroar = ['', '', 'Simba (Pyroar) (F) @ Charcoal', 'Ability: Unnerve',
      'Level: 44', 'Modest Nature', '- Flamethrower', '- Hyper Voice',
      '', ''].join('\n');
    await session.eval('addSets(' + JSON.stringify(team + secondPyroar) + ', "Box")');
    const evaluate = async fn => session.eval('(' + fn.toString() + ')()');
    await evaluate(() => {
      $('#p1 input.set-selector').select2('data', { id: 'Pyroar (My Box)', text: 'Pyroar (My Box)' }).change();
      const trainer = TR_NAMES.find(name => name.startsWith('Swoobat (') && name.includes('Marlon2')).split('[')[0];
      $('#p2 input.set-selector').select2('data', { id: trainer, text: trainer }).change();
    });

    assert.deepEqual(await evaluate(() => {
      const duplicate = $('.player-poks [data-id="Pyroar (My Box 2)"]');
      duplicate.trigger('contextmenu');
      const party = $('.player-party [data-id="Pyroar (My Box 2)"]').parent();
      return [duplicate.length, party.find('.bp-info').first().text().trim()];
    }), [1, 'Flamethrower']);
    assert.deepEqual(await evaluate(() => {
      $('#p1 .set-selector').val('Pyroar (My Box 2)').change();
      const original = window.confirm;
      window.confirm = () => true;
      try { $('#box-remove').click(); } finally { window.confirm = original; }
      const saved = JSON.parse(localStorage.customsets).Pyroar;
      return [saved['My Box'].level, !!saved['My Box 2'], !!setdex.Pyroar['My Box 2'],
        $('.player-party [data-id="Pyroar (My Box 2)"]').length];
      // the level of the Pyroar the owner's box actually holds
    }), [40, false, false, 0]);
    await session.eval('addSets(' + JSON.stringify(team) + ', "Box")');
    assert.deepEqual(await evaluate(() => {
      $('#clearSets').click();
      return [localStorage.getItem('customsets'), !!setdex.Pyroar['My Box'],
        !!setdex.Pyroar['My Box 2'], $('.trainer-pok.left-side').length];
    }), [null, false, false, 0]);
    console.log('ok: duplicate party preview, selected removal, and clear-all');

    await session.eval('addSets(' + JSON.stringify(team) + ', "Box")');
    // A smaller re-import must remove obsolete numbered entries from the live dex too.
    const single = 'Pyroar (F)\nAbility: Royal Roar\nLevel: 36\nModest Nature\n- Flamethrower\n- Thief\n';
    await session.eval('addSets(' + JSON.stringify(single) + ', "Box")');
    assert.equal(await session.eval('!!setdex.Pyroar["My Box 2"]'), false);
    await evaluate(() => {
      $('#p1 .set-selector').val('Pyroar (My Box)').change();
      $('#camomons').prop('checked', true).change();
      $('#p1 .move1 .move-selector').val('Surf').change();
      $('#p1 .move2 .move-selector').val('Fly').change();
    });
    await session.waitFor('$("#p1 .type1").val() === "Water" && $("#p1 .type2").val() === "Flying"');
    await evaluate(() => $('#p1 .move2 .move-selector').val('Surf').change());
    await session.waitFor('$("#p1 .type1").val() === "Water" && $("#p1 .type2").val() === ""');
    await evaluate(() => $('#p1 .set-selector').val('Pyroar (My Box)').change());
    await session.waitFor('$("#p1 .type1").val() === "Fire" && $("#p1 .type2").val() === "Dark"');
    await evaluate(() => $('#camomons').prop('checked', false).change());
    await session.waitFor('$("#p1 .type1").val() === "Fire" && $("#p1 .type2").val() === "Normal"');
    console.log('ok: Camomons follows move changes, duplicate types, set selection and disabling');

    assert.deepEqual(await evaluate(() => {
      $('#vicious-sandstorm').prop('checked', true).change();
      $('#p1 .ability').val('Sand Stream').change();
      const vicious = createField().weather;
      $('#sand').prop('checked', true).change();
      autosetWeather('Sand Stream', 0);
      return [vicious, createField().weather];
    }), ['Vicious Sandstorm', 'Sand']);
    const errors = session.problems.filter(p =>
      !/console_watcher\.js|favicon\.ico|Zygarde|zygarde/.test(p));
    assert.deepEqual(errors, [], 'unexpected browser errors');
    console.log('ok: Sand Stream preserves Vicious Sandstorm and ordinary Sand');
  });
  console.log('all review checks passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
