# Unbound implementation and verification notes

Historical implementation evidence retained from the first-build handoff, consolidated
2026-09-13. Start with [HANDOFF.md](HANDOFF.md) for current status, commands, and scope.
These observations are not claims that every investigation was repeated during the latest
review. Recorded donor agreement establishes port fidelity, not full ROM accuracy.

## The look

`css/layout-b.css` loads last, on `index.html` only, so the mastersheet, planner and
fragsheet keep their own styling. It carries **donor B's geometry over this fork's dark
palette** and declares no colour anywhere. An earlier commit did the opposite — donor B's
colours and none of its geometry — and was reverted.

The whole size difference was one declaration. Both sheets already set `10pt Verdana` on
`html, body`; this fork then set `.panel` to 18px, inflating every em-based width inside
the panels by about 35%. The form controls carry their own explicit sizes on top of that
(a bare `input { font-size: 18px }` among others) and needed handling separately.

Measured against donor B served locally, both in the same headless browser at 1276px:

| | before | now | donor B |
|---|---|---|---|
| panel font | 18px | 13.33px | 13.33px |
| `.poke-info` | 540px | 400px | 400px (30em) |
| `.field-info` | 510px | 367px | 367px (27.5em) |
| number input | 18px, 27x60 | 13.3px, 19x46 | 13.3px, 21x48 |
| select | 16px, 21x79 | 13.3px, 19x70 | 13.3px, 19x70 |
| stat row pitch | 33px | 21px | 23px |
| field buttons | h40 | h23 | h23 |

Four constants in `css/main.css` were sized for the old 18px scale and broke when it
shrank. Check these first if you change the type scale again:

| constant | what it did |
|---|---|
| `.poke-sprite` `calc(100% - 430px)` | goes negative at 30em, so the sprites vanish |
| `.right-table` `height: 205px` | 62px of dead space under a 143px table, dropping Pokemon 2 out of line with Pokemon 1 |
| `.btn-xxxwide` `height/line-height: 30px` | donor B sizes that class by width alone |
| `#player-tags` `top: 71px` | collides with the Type row once the rows above it shrink |

The `width <= 1180px` reflow (`.panel-wrapper` wraps and `.panel-mid` takes `order: 2`, so
Field drops below the pair) had never worked: the two Pokemon columns are sized
`calc(50vw - 10px)` against the viewport while the wrapper adds `padding: 0 1em`, so the
pair overflowed the content box by a few pixels and all three stacked instead. They are
sized against the wrapper now. That block is also a touch-scale enlargement — 40-60px
rows, 18-24px type — which is neutralised so density holds at every width.

**Sprites.** `boxSprites = ["newhd", "pokesprite"]`, two selectable sets at 300x300 and
40x30. The same box tiles therefore *downscale* one and *upscale* the other, so
`image-rendering: pixelated` is right for `pokesprite` and aliases badly on `newhd`. The
rule is scoped by the style class each tile carries. The panel sprite (`.poke-sprite`) is
left smoothed, by the owner's preference. The held-item icon takes `pointer-events: none`
because the click handler sits on the sprite underneath it.

**Coverage limit:** the geometry check measures the panel sprite and `pokesprite` tile
styles, but does not exercise a `newhd` box tile or compare rendered images. The original
blanket pixelated rule was caught by the owner before the geometry check was added.

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

The owner's box export then turned up two more, both in the existing importer and both affecting
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
   data. Donor B still crashes on four cases in the recorded Difficult sweep below.
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

**Verification scope:** the original implementation compared species base stats/types
and move power/type/split with selected ROM tables, and documented disassembly evidence
for one damage constant. This does not verify all data fields, trainer teams, or the full
damage formula. Other checks establish donor agreement for their selected inputs.
The review did not independently repeat the ROM-table analysis or disassembly.

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
/ Protect. Difficult and Insane Vega are unaffected. Restoring the record requires evidence
for the species and an explicit correction before removing its quarantine. Removing the
quarantine entry alone does not repair the malformed species key.

One move name is also unresolved: **Bad Tantrum**, on Pupitar in
`Lvl 47 Rival 4 |Player Chose Gible|`, all tiers. It matches nothing in either move table. The
slot is left blank rather than guessed — "Stomping Tantrum" is plausible but is not evidence.

Five other misspelled move names were corrected against the referencing set and are live:
`ThunderPunch`, `Heatt Wave`, `Freeze Dry`, `DIscharge`, and `Hidden Power (Fire?)`. The last
carries the donor's own question mark; it is read as Fire.

No additional missing trainer species were identified in that comparison. The plan's inherited figure of 39 unknown species IDs turned out to
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
| Difficult | 2839 | 99.30% | 16 | 4 (all four are donor B crashing) |
| Expert | 3040 | 99.61% | 11 | 1 (Multi-Attack; this fork is the correct one) |
| Insane | 3313 | 99.64% | 12 | 0 |

**Recorded donor sweep, 2026-09-13, before the later navigation review.** See the dated
stdout in `check/results/`. The navigation review did not rerun these sweeps. Two moved in this
fork's favour, because the table had been written before the last engine work landed:

| tier | was recorded | re-run | what changed |
|---|---|---|---|
| Difficult | 99.26%, 5 unexplained | 99.30%, 4 | one real disagreement resolved |
| Expert | 99.57%, 2 unexplained | 99.61%, 1 | one real disagreement resolved |
| Insane | 99.64%, 0 | 99.64%, 0 | unchanged |

Species data is 100% identical on every tier (223, 240 and 265 species). Neither engine
threw on Expert or Insane; the four Difficult disagreements are all donor B crashing.

The single remaining unexplained case, on Expert, is Silvally / Lvl 80 Title Defense Zeph
attacking with Multi-Attack under RKS System and a Steel Memory: this fork reads 142-168,
donor B reads 95-112. The ratio is STAB, and Silvally holding a Memory *is* that type in
game, so **this fork's number is right and donor B's is wrong**. The mechanism is still the
inherited one described under "Known and left alone" — right answer, wrong route — so it
would only mislead on a Silvally whose listed type does not match its Memory.

Agreement is *lower* than it was before the ROM check, deliberately. Where the cartridge
says both donors are wrong, this calculator follows the cartridge.

The original donor comparison reported matching species base stats/types and move data
before the ROM-based move-power overrides. The final loaded Hydro Pump and Aura Sphere
powers intentionally differ. Historical trainer-set differences include the corrections
and exclusions described above; the comparison is not proof of in-game trainer accuracy.

Each ported effect was run on a case built to discriminate it and compared with donor B on
identical inputs — explicit base stats, types and weights, and moves whose stock base power
matches in both engines, because donor B's stock move table carries older values and its
`calculate()` re-clones the move from that table. All agree. With the effects off, six
recorded stock-dex results are unchanged from before the merge.

**The donor checks establish port fidelity for those cases.** The original implementation
also read ROM tables and disassembled selected code as documented above; no emulator
battle observations are recorded. Donor matching remains the first-build bar in
[ADR 0003](adr/0003-donor-matching-accepted-for-first-build.md), with the ROM as arbiter
under [ADR 0002](adr/0002-unbound-ground-truth-from-rom.md) for later disputed behavior.

One intentional divergence from donor B: B implements Camomons in the UI by copying the first
two move types into the type selects, which can leave both slots holding the same type — and
the engine would then apply that type's effectiveness twice. The derivation here collapses
repeats. Other intentional and unresolved differences are documented separately above
and below; this is not a claim of complete agreement.

## Known and left alone

- `calc/mechanics/util.js` holds two copies of its helpers, one behind a
  `damageGen != 8 && damageGen != 7` guard. Only the copy the Unbound path runs was changed.
  Big Mo and Sand-Rush-in-Vicious-Sandstorm therefore do not apply below `dmgGen=7`.
- The historical loader writes source flag names such as `flags.makesContact`, while
  the engine reads `flags.contact`, and uses truthy checks that skip explicit false.
  Unbound opts into `apply_move_flags`, which translates supplied flags and honors false.
  Other titles retain the historical path; they were not migrated in this merge.
- The loader registers custom moves under `MOVES_BY_ID[8]` regardless of the selected
  generation. Unbound runs at gen 8, so this is correct here and untouched.
- A's and donor B's parallel-speed helpers differ on paralysis in gen 7
  (`gen.num < 7` here, `gen.num != 7` there). Inherited, not introduced by this port.
- **Remaining historical donor discrepancies:**
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
