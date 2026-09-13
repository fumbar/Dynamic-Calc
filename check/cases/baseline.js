// Pre-merge baseline: stock-dex results on the generation path Unbound will use
// (gen=8&dmgGen=8). These must not move when Unbound effects are switched off.
module.exports = {
  query: '?gen=8&dmgGen=8&types=6',
  cases: [
    {
      name: 'physical, neutral: Garchomp Earthquake vs Blissey',
      gen: 8,
      attacker: { species: 'Garchomp', level: 50, nature: 'Adamant', evs: { at: 252 } },
      defender: { species: 'Blissey', level: 50, nature: 'Bold', evs: { hp: 252, df: 252 } },
      move: { name: 'Earthquake' },
    },
    {
      name: 'special, super effective: Latios Draco Meteor vs Garchomp',
      gen: 8,
      attacker: { species: 'Latios', level: 50, nature: 'Timid', evs: { sa: 252 } },
      defender: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { hp: 252 } },
      move: { name: 'Draco Meteor' },
    },
    {
      name: 'weather: no sand, special hit on a Rock type',
      gen: 8,
      attacker: { species: 'Latios', level: 50, nature: 'Timid', evs: { sa: 252 } },
      defender: { species: 'Regirock', level: 50, nature: 'Careful', evs: { hp: 252 } },
      move: { name: 'Surf' },
    },
    {
      name: 'weather: sandstorm SpD boost on the same Rock type',
      gen: 8,
      attacker: { species: 'Latios', level: 50, nature: 'Timid', evs: { sa: 252 } },
      defender: { species: 'Regirock', level: 50, nature: 'Careful', evs: { hp: 252 } },
      move: { name: 'Surf' },
      field: { weather: 'Sand' },
    },
    {
      name: 'type chart: immunity via inverse battle off',
      gen: 8,
      attacker: { species: 'Pikachu', level: 50, nature: 'Timid', evs: { sa: 252 } },
      defender: { species: 'Gastrodon', level: 50, nature: 'Bold', evs: { hp: 252 } },
      move: { name: 'Thunderbolt' },
    },
    {
      name: 'type chart: same case with inverse battle on',
      gen: 8,
      attacker: { species: 'Pikachu', level: 50, nature: 'Timid', evs: { sa: 252 } },
      defender: { species: 'Gastrodon', level: 50, nature: 'Bold', evs: { hp: 252 } },
      move: { name: 'Thunderbolt' },
      field: { isInverseBattle: true },
    },
  ],
};
