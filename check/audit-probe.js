// Read-only audit probes; print observed title and loader behavior.
const { withBrowser } = require('./browser');
withBrowser(async ({session, base}) => {
  const titles = [
    ['Unbound', 'data=unbound&gen=8&dmgGen=8&types=6'],
    ['Renegade Platinum', 'data=26138cc1d500b0cf7334&gen=7&dmgGen=4&types=6&switchIn=4'],
    ['Blaze Black', 'data=9aa37533b7c000992d92&gen=5&dmgGen=5&types=5'],
    ['Inclement Emerald', 'data=68bfb2ccba14b7f6b1f0&gen=8&dmgGen=8&types=6'],
    ['Fire Red', 'data=12f82557ed0e08145660&gen=3&dmgGen=3&types=3']
  ];
  for (const [label, query] of titles) {
    await session.clearStorage(base);
    try {
    const params = new URLSearchParams(query);
    params.sort();
    await session.open(base + '/index.html?' + params,
      'typeof setdex === "object" && setdex && typeof performCalculations === "function"');
    await session.waitFor('$("#p1 .move1 .move-selector option").length > 100');
    const result = await session.eval(`(() => {
      const mismatch = Object.keys(jsonMoves).filter(n => moves[n] &&
        Object.prototype.hasOwnProperty.call(jsonMoves[n], 'priority') &&
        jsonMoves[n].priority !== calc.Generations.get(Number(g)).moves.get(calc.toID(n))?.priority);
      return {title: TITLE, species: Object.keys(setdex).length,
        priorityMismatches: mismatch.map(n => [n,jsonMoves[n].priority,calc.Generations.get(Number(g)).moves.get(calc.toID(n))?.priority]),
        stockIsWorkingDex: pokedex === calc.SPECIES[gen]};
    })()`);
    console.log(label, JSON.stringify(result));
    if (label === 'Unbound') {
      console.log('tier identity', await session.eval(`(() => {
        for (const sp in setdex) for (const sn in setdex[sp]) {
          if (UNBOUND_DONOR.formatted_sets.insane[sp]?.[sn]) {
            localStorage.right = sp+' ('+sn+')';
            return {id: localStorage.right, loaded: savedOpponentIsLoaded()};
          }
        }
      })()`));
      console.log('dropdown', await session.eval(`Array.from(document.querySelectorAll('.calc-select option')).filter(o => /Unbound|Renegade/.test(o.text)).map(o => [o.text,o.getAttribute('data-source')])`));
    }
    } catch (e) { console.log(label, e.message); }
    console.log('errors', session.problems.filter(p => !/console_watcher\.js|favicon\.ico/.test(p)));
  }
}).catch(e => { console.error(e); process.exitCode = 1; });
