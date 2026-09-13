# Unbound merge: first build

Written for: the project owner, and whoever picks the branch up next.

Branch `unbound-merge` in `dynamic-calc-merge-opus`, three commits on top of `1b8da408`.
Scope follows [the revised plan](IMPLEMENTATION-PLAN-REVISED.md). Switch-in prediction and
the design pass are deliberately not in this build.

## Run it

```
python -m http.server 8000        # or any static server, from the repo root
```

Then open:

```
http://localhost:8000/index.html?data=unbound&gen=8&dmgGen=8&types=6
```

Add `&m=difficult` or `&m=insane` for the other tiers. Absent or unrecognised values load
Expert. The tier selector next to the title does the same thing by rewriting the URL.

## Checks

```
node check/run.js         # recorded damage fixtures, effects off
node check/mechanics.js   # each ported effect, against donor B on identical inputs
node check/ui.js          # the real page in headless Chrome (42 checks)
```

No `npm install`. `check/ui.js` drives Chrome or Edge over the DevTools protocol and fails on
any uncaught page exception or console error, apart from two pre-existing 404s
(`js/console_watcher.js`, which is referenced by `index.html` but absent from the repository
on `master` too, and `favicon.ico`).

## What shipped

**Data and tiers.** `backups/unbound.js` carries hzla's Unbound data (donor C, `eb3226e`)
wrapped so its bare `pokedex` assignment cannot overwrite the stock dex.
`js/unbound_adapter.js` selects the tier and builds a payload for the existing
`loadDataSource()`. All three tiers load: Difficult 223 species / 355 sets, Expert 240 / 380,
Insane 265 / 415, after the exclusions below.

**Table isolation.** `loadDataSource()` overrides `pokedex`, `moves`, `SPECIES_BY_ID[gen]` and
`MOVES_BY_ID[g]` in place. For titles that ask for it, those are swapped for copies first, so
the stock dex survives the load and the donor data is never aliased. A check pins this to a
number: Liepard stays 98 base Attack in the stock table while the Unbound table reads 88.

**Field effects.** Vicious Sandstorm, Shadowy Veil, Big Mo and Camomons, ported from donor B
and carried on donor C's field flag names. Controls appear beside the weather bar for this
title only. Inverse battle was already implemented here and is reused unchanged.

**Text import.** The existing parser handles a Showdown-format box, the sets reach the box and
the selectable list, and an imported Liepard calculates off Unbound's base stats.

## Two bugs found and fixed on the way

1. **No Unbound base power was being applied at all.** The donor states base power as `bp`;
   `loadDataSource()` reads `basePower`. Every Unbound move silently kept its stock value —
   Surf calculated at 90 instead of 95, across all 873 moves. The adapter now fills
   `basePower` in. This affected every damage number in the title, so it is worth a second
   look if any result seems off in the other direction.
2. **`weightkg` and `nfe` never reached the engine.** The loader wrote base stats, types and
   abilities to both the UI table and `SPECIES_BY_ID`, but weight and Eviolite eligibility
   only to the UI table — and the engine reads them from `SPECIES_BY_ID`. Dusclops with
   Eviolite is in the Expert battle used as a check, so this was live.

## Excluded records — please read

Three trainer sets are excluded. In each the donor's species column holds a pipe-delimited
trainer label instead of a species (the donor writes trainers as
`Science Society Scientist |Supply and Demand|`), and the real species is not recoverable from
the data. Guessing would mean calculating against the wrong Pokémon, so they are dropped and
named instead:

| Tier | Trainer | Impact |
|---|---|---|
| all three | Science Society Scientist \|Supply and Demand\| | its only set, a side battle |
| all three | Science Society Scientist \|Rogue Electivire\| | its only set, a side battle |
| Expert | Light of Ruin Vega, Lvl 47 | **Vega's Expert team shows 5 members, not 6** |

The missing Vega record is Timid, Scope Lens, Super Luck, Dark Pulse / Air Cutter / Heat Wave
/ Protect. Difficult and Insane Vega are unaffected. If you recognise the Pokémon, one line in
`UNBOUND_QUARANTINED_SPECIES` turns it back on.

One move name is also unresolved: **Bad Tantrum**, on Pupitar in
`Lvl 47 Rival 4 |Player Chose Gible|`, all tiers. It matches nothing in either move table. The
slot is left blank rather than guessed — "Stomping Tantrum" is plausible but is not evidence.

Five other misspelled move names were corrected against the referencing set and are live:
`ThunderPunch`, `Heatt Wave`, `Freeze Dry`, `DIscharge`, and `Hidden Power (Fire?)`. The last
carries the donor's own question mark; it is read as Fire.

Nothing else is missing. The plan's inherited figure of 39 unknown species IDs turned out to
count donor dex entries no trainer references — 35 Gmax forms plus four others. Only four
species names in the trainer data are absent from the stock dex, and the one real species
among them, Shadow-Warrior, is created from the donor entry.

## Checked, and what that does and does not establish

Each ported effect was run on a case built to discriminate it and compared with donor B on
identical inputs — explicit base stats, types and weights, and moves whose stock base power
matches in both engines, because donor B's stock move table carries older values and its
`calculate()` re-clones the move from that table. All agree. With the effects off, six
recorded stock-dex results are unchanged from before the merge.

**This establishes port fidelity, not game accuracy.** No ROM observation was made; the ROM
was not read at all. Per [ADR 0003](adr/0003-donor-matching-accepted-for-first-build.md) that
is the agreed bar for this build, and [ADR 0002](adr/0002-unbound-ground-truth-from-rom.md)
still stands for anything later.

One intentional divergence from donor B: B implements Camomons in the UI by copying the first
two move types into the type selects, which can leave both slots holding the same type — and
the engine would then apply that type's effectiveness twice. The derivation here collapses
repeats. Everything else matches.

## Known and left alone

- `calc/mechanics/util.js` holds two copies of its helpers, one behind a
  `damageGen != 8 && damageGen != 7` guard. Only the copy the Unbound path runs was changed.
  Big Mo and Sand-Rush-in-Vicious-Sandstorm therefore do not apply below `dmgGen=7`.
- The loader writes move flags as `flags.makesContact`, which the engine never reads — it
  reads `flags.contact` — and its truthy test would drop an explicit `false`. Both are dead
  for Unbound: all 14 donor `makesContact: false` overrides agree with stock, so no result
  changes. Left alone rather than changed blind for ~30 other titles.
- The loader registers custom moves under `MOVES_BY_ID[8]` regardless of the selected
  generation. Unbound runs at gen 8, so this is correct here and untouched.
- A's and donor B's parallel-speed helpers differ on paralysis in gen 7
  (`gen.num < 7` here, `gen.num != 7` there). Inherited, not introduced by this port.
- Direct Unbound save import is still not possible; no reader for its layout exists in either
  fork. The import fixture is representative Showdown-format text, not a verified Unbound
  Cloud export — if you have a real one, running it through `addSets()` is a one-line check.
- The box is still shared across titles, as agreed.

## Next

Prediction, the density pass, and anything ROM-verified. The fixture harness loads both this
fork and donor B from source on stated inputs, so a ROM observation can be added to the same
cases without rebuilding anything.
