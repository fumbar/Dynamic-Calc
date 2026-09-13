# Unbound merge: first build

Written for: the project owner, and whoever picks the branch up next.

Branch `dynamic-calc-merge-opus`, four commits on top of `1b8da408`. Named for the working
copy at the owner's request; the planning documents and ADR 0001 call it `unbound-merge`.
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
node check/ui.js          # the real page in headless Chrome (51 checks)
node check/agreement.js <tier>   # every trainer set, this fork vs donor B
node check/rom-data.js           # loaded species and move data vs the cartridge
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

**Text import.** Checked against your real Unbound Cloud box export
(`docs/example_box.txt`, 18 Pokemon). All 18 import, all are selectable, and an imported
Trevenant calculates off Unbound's base Attack of 110 rather than the stock 120. Two importer
bugs that export exposed are fixed below.

## Bugs found and fixed on the way

1. **No Unbound base power was being applied at all.** The donor states base power as `bp`;
   `loadDataSource()` reads `basePower`. Every Unbound move silently kept its stock value —
   Surf calculated at 90 instead of 95, across all 873 moves. The adapter now fills
   `basePower` in. This affected every damage number in the title, so it is worth a second
   look if any result seems off in the other direction.
2. **`weightkg` and `nfe` never reached the engine.** The loader wrote base stats, types and
   abilities to both the UI table and `SPECIES_BY_ID`, but weight and Eviolite eligibility
   only to the UI table — and the engine reads them from `SPECIES_BY_ID`. Dusclops with
   Eviolite is in the Expert battle used as a check, so this was live.

Your box export then turned up two more, both in the existing importer and both affecting
every title, not just Unbound:

3. **A nickname that is also a species name imported a second, wrong Pokemon.** The parser
   scanned the whole header row and imported every token that matched a species. Your
   `Zygarde (Zygarde-10%)` produced two box entries: the correct Zygarde-10%, and a base
   Zygarde built from the same set — different base stats, silently selectable. The row now
   stops at the first species, and a nicknamed row is read from the parenthesised name.
4. **A species held twice in the box lost one copy.** Every imported set was written to the
   hardcoded slot `"My Box"`, so your second Pyroar overwrote the first. Duplicates now take
   `"My Box 2"` and so on, numbered per import so re-importing the same box does not
   accumulate.

Comparing every trainer set against donor B then turned up the rest:

5. **Five Unbound abilities were missing, and could not even be selected.** `Multieye`,
   `Icy Skin`, `Portal Power`, `Bellow` and `Sound Waves` are absent from the stock ability
   list, so the ability selector could not hold them - the calculation ran with whatever the
   selector fell back to - and their damage effects were not implemented at all. All five are
   ported from donor B, and every Unbound ability name is now added to the selector from the
   data rather than a hand-written list. This accounted for 16 of the 26 disagreements.
6. **Iron Fist missed Wicked Blow.** The donor supplies `isPunch`, but the loader wrote flags
   under the source's own names while the engine reads `flags.punch`, so every supplied flag
   was discarded - for every title. Fixed behind a per-title opt-in, so only Unbound's move
   data changes here. Custom moves also had their flags wiped outright.
7. **Two crashes from unresolvable donor data.** A set naming an item no table knows took the
   whole calculation down on Knock Off (`Houndoomite`, `Kangaskhite`, `Weakmess Policy`,
   `Flynium Z`, `Necrozium Z` - all truncations of real names, now corrected), and Miltank's
   Difficult-tier Leader Mel set carries `nature: "72"`, which is not a nature and threw.
   Both engine paths are guarded as well, because a crash is never the right answer to bad
   data. Donor B still crashes on these, which is why its column shows four throws above.
8. **Hydro Pump and Aura Sphere had the wrong base power**, found by reading the ROM:
   the cartridge says 120 and 90, both donors say 110 and 80. Corrected from the ROM, which
   means this calculator now deliberately disagrees with both donors on those two moves.

## What the ROM settled

The cartridge (md5 `9cad8e771940e7f7094d13911552cef0`) was read directly — see
[ADR 0004](adr/0004-rom-checked-data-layer.md) for the table offsets and how they were
found. This is ground truth in the sense ADR 0002 means: numbers from the cartridge, not
from another calculator.

- **Species base stats and types: 99.48% agreement, and no difference at all on any
  species a trainer uses.** The six differences are calculator-only pseudo-forms
  (`Aegislash-Both`, the Castform weather forms) and two unused donor entries.
- **Move power, type and split: 99.67% of the moves trainers use.**
- **Two donor errors corrected against the cartridge: Hydro Pump is 120, not 110, and Aura
  Sphere is 90, not 80.** Both donors have these wrong. Hydro Pump is common enough that
  this matters; the calculator now deliberately disagrees with both donors here.
- The `bp`/`basePower` loader bug is confirmed as real: the ROM gives Surf, Thunderbolt,
  Flamethrower and Ice Beam 95, which is what the donor data says and the stock tables
  did not.
- CFRU source (pinned at `b637a27`) confirmed the Portal Power port exactly: 0.75x against
  non-contact moves, behind a flag CFRU documents as Hoopa-Unbound's ability in Unbound.

- **The `-ate` boost is 1.3x**, read out of the compiled code rather than the data
  tables. See below.

### How much of the damage formula is verified: not much

The `-ate` constant was disassembled and settled. An attempt was then made to do the same
for the rest of the damage-affecting configuration — CFRU exposes it as a bounded list of
compile flags (`OLD_CRIT_DAMAGE`, `OLD_GEM_BOOST`, `OLD_TERRAIN_BOOST`,
`OLD_PARENTAL_BOND_DAMAGE`, `OLD_EXPLOSION_BOOST`, `OLD_SOUL_DEW_EFFECT`), which is the
right shortlist because that is exactly where a calculator silently diverges.

That attempt mostly did not succeed, and the failures are worth recording:

- **Automating the switch mapping produced wrong answers.** A script that walked the
  ability switch and reported each case's multiplier gave Technician 13, where reading the
  same code by hand gives 15, and listed abilities that are not damage boosts at all. Those
  numbers were discarded. Hand-reading worked; inference did not.
- **Crit multiplier: probably 1.5x, on one site only.** A scan for "10 then 15 or 20 stored
  to the same slot" returned four candidates, three of which turned out to be the divisor
  in an unrelated `(x * K) / 10`. The one real-looking site (`0x09e1ef8`) sets a local to 10
  and then to 15, which is the shape of `crit = BASE; if (crit) crit = CRIT_MULTIPLIER`, and
  no site anywhere pairs 10 with 20. That points to 1.5x, which is what this calculator
  uses — but it is one site, not the three independent corroborations the `-ate` finding
  had, so it is *suggestive, not confirmed*.
- **Gem boost: not determined.** Unbound sets carry Normal, Fighting, Fairy and Grass Gems,
  so 1.3x versus 1.5x matters. The case found at `ITEM_EFFECT_GEM`'s CFRU id applies a
  doubling, not either value, which means either DPE renumbers hold effects or that is not
  the gem code. Unresolved, and not guessed at.
- **Terrain boost, Parental Bond, explosion, Soul Dew: not looked at.**

STAB at 1.5x and Adaptability at 2x were read from CFRU source rather than the ROM, and
match this calculator.

**So: the data layer is ROM-verified, one damage constant is ROM-verified, and the damage
formula as a whole is not.** Everything else rests on agreeing with two donor calculators,
which is the ADR 0003 bar and is not the same as being right. The honest summary is that
nobody — here or in either donor — has checked the formula against the cartridge.

The procedure in `check/rom-ate.md` is what works: find the shared `(x * k) / d` tail of a
switch by hand, then read the constant each case sets, and corroborate against cases whose
values CFRU documents. It is slow and it does not automate well. Each remaining constant is
perhaps an hour of that.

### The -ate boost: settled by disassembling the ROM

Aerilate, Pixilate, Refrigerate and Galvanize apply 1.3x in both donors and 1.2x in this
fork's inherited code. CFRU has this as a compile-time switch, `OLD_ATE_BOOST`, shipped
commented out — so CFRU source could say what an unmodified build does, but not what
Unbound compiled.

Disassembling the ROM settled it. The ability power switch at `0x09cd4e6` funnels every
boosting case into one shared `(power * r3) / 10` tail; the branch taken when the move is
retyped sets `r3` to 13. **Unbound compiles with `OLD_ATE_BOOST`, so the boost is 1.3x**,
and this fork now applies it. The same switch reads Technician and Mega Launcher at 15 and
Iron Fist at 12 — exactly what CFRU documents — which is how the reading was checked.
`check/rom-ate.md` has the full trail.

Worth knowing how this went: the branch got it wrong twice first. It moved to 1.3x because
both donors said so, then reverted to 1.2x because CFRU ships the switch off and donor
agreement is not evidence. The revert's reasoning was sound and its conclusion was wrong.
Only reading the ROM separated them.

It affects Champion Jax's Salamence-Mega, Elite Four Arabella's Sylveon and a handful of
others by about 8%, so it was worth the effort.

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

`check/agreement.js` compares **every trainer set in every tier** against donor B, running
this fork in the real page (so `loadDataSource` has applied the title's data) and donor B on
its own tables. Each set both attacks and defends, and every Pokemon is built from explicit
base stats, types and weight, so a data difference cannot be mistaken for an engine one.

| tier | comparisons | agree | ROM-backed differences | unexplained |
|---|---|---|---|---|
| Difficult | 2839 | 99.26% | 16 | 5 (4 are donor B crashing) |
| Expert | 3040 | 99.57% | 11 | 2 |
| Insane | 3313 | 99.64% | 12 | 0 |

Agreement is *lower* than it was before the ROM check, deliberately. Where the cartridge
says both donors are wrong, this calculator follows the cartridge.

Underneath that, the two data sets themselves match: species base stats and types agree
100%, and the move data every set uses agrees 100%. Trainer sets agree on 98-99%, and every
difference is a correction this fork applies and donor B does not.

The unexplained column is inherited differences between this fork's engine and donor B's,
present before the port and not introduced by it.

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
- **The three remaining disagreements with donor B**, all inherited and all left alone:
  - *Liquid Voice* (Primarina, two sets). This fork gives it a power boost donor B does not.
    The cause is operator precedence in `calc/mechanics/gen78.js`: an Inclement Emerald boost
    sits outside its own `INC_EM &&` guard and leaks into every title. Liquid Voice grants no
    power boost in the real games, so this fork is probably wrong - but the fix would change
    Inclement Emerald and every other title, so it is reported rather than changed blind.
  - *Multi-Attack* (Silvally, one set). This fork types the move from the user's first type;
    donor B types it from the Memory but does not change the user's type. Neither does both,
    which is what the real games do. Against the neutral test target the only difference is
    STAB, so this fork lands on the right number by the wrong route.
  - Donor B additionally crashes on the four sets whose item names this fork corrects.
- Direct Unbound save import is still not possible; no reader for its layout exists in either
  fork. Text import is the route, and it is now checked against a real Cloud export.
- `Zygarde-10%` has a `%` in its name, so its sprite URL is not valid percent-encoding and the
  sprite does not load. Cosmetic, pre-existing, and not specific to Unbound.
- The box is still shared across titles, as agreed.

## Next

Prediction, the density pass, and anything ROM-verified. The fixture harness loads both this
fork and donor B from source on stated inputs, so a ROM observation can be added to the same
cases without rebuilding anything.
