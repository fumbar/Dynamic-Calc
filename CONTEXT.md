# Dynamic Calc

A Pokémon damage calculator that loads its species, move and trainer data per ROM hack
rather than shipping a single game's data. This context covers the calculator itself and
the vocabulary used to describe the games it calculates for.

## Language

### Data

**Title**:
One ROM hack the calculator can load data for, identified by name (e.g. "Unbound 2.1.1").
A title owns its own species, move and trainer data.
_Avoid_: game, ROM, hack, source

**Stock dex**:
The unmodified Showdown species and move data the calculator falls back to. Always present;
a title's data never replaces it globally.
_Avoid_: vanilla dex, base dex, default data

**Trainer set**:
One Pokémon as a specific trainer actually carries it, named by the convention
`Lvl LEVEL TRAINER_NAME`. Trainer identity is carried in the set name, not a separate record.
_Avoid_: moveset, build, spread

**Difficulty tier**:
One of Unbound's selectable difficulties — Difficult, Expert or Insane — each a complete,
separate collection of trainer sets for the same title.
_Avoid_: mode, difficulty mode, challenge level

### Prediction

**Switch-in prediction**:
Working out which Pokémon the enemy AI will send in next. Named for the Pokémon coming in,
never the one going out.
_Avoid_: swap-out prediction, switch-out prediction, bait order

**Bait score**:
The ranking a switch-in prediction produces for each candidate Pokémon on the enemy team.
_Avoid_: switch score, threat score

### Accuracy

**Ground truth**:
What the game itself does, established from the ROM or from the engine's source — not from
agreement between calculators.
_Avoid_: reference implementation, correct answer

**CFRU**:
The Complete FireRed Upgrade, the engine Pokémon Unbound is built on. A Gen 3 engine with
later-generation mechanics selectively backported, so it matches no single generation exactly.
_Avoid_: the engine, FireRed base

**DPE**:
Dynamic Pokémon Expansion, CFRU's companion project supplying expanded species, moves and
abilities.
_Avoid_: the expansion
