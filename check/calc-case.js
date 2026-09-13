// Runs one explicit calculation case through the loaded browser calc API and
// returns its damage rolls, so fixtures record numbers rather than descriptions.
const { load } = require('./harness');

function run(cases, opts = {}) {
  const { calc, sandbox } = load(opts);
  const { Generations, Pokemon, Move, Field, calculate } = calc;
  return cases.map(c => {
    const gen = Generations.get(c.gen);
    if (c.fieldEffects) sandbox.FIELD_EFFECTS = c.fieldEffects;
    const attacker = new Pokemon(gen, c.attacker.species, c.attacker);
    const defender = new Pokemon(gen, c.defender.species, c.defender);
    const move = new Move(gen, c.move.name, c.move);
    const field = new Field(c.field || {});
    const result = calculate(gen, attacker, defender, move, field);
    return {
      name: c.name,
      damage: result.damage,
      defenderMaxHP: defender.maxHP(),
      attackerStats: attacker.stats,
      defenderStats: defender.stats,
    };
  });
}

module.exports = { run };
