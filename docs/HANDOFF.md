# Unbound merge: first build

Written for: whoever works on this next, including the project owner.

## Start here

You are picking up a merge that brings Pokemon Unbound into this fork of Dynamic-Calc.
The implementation lives on local branch `dynamic-calc-merge-opus`, based on
`1b8da408`. The review fixes are working-tree changes, not new commits. Check `git status`
and `git log` for the current state. The branch is named for the working copy at the owner's
request; the planning documents and ADR 0001 still call it `unbound-merge`. Do not rebase
onto upstream — see [ADR 0001](adr/0001-long-lived-fork-no-upstream-rebase.md).

Switch-in prediction and the design pass are deliberately not in this build.

Read in this order: this file, then [the revised plan](IMPLEMENTATION-PLAN-REVISED.md) for
scope and the owner's decisions, then [RUNTIME-TRACE.md](RUNTIME-TRACE.md) before you touch
anything in `calc/`. The four ADRs record decisions you should not silently reverse.

### What is on disk

| What | Where | Notes |
|---|---|---|
| This fork ("A") | `D:/antigrav-projs/dynamic-calc-merge-opus` | the working copy |
| Upstream original | `D:/antigrav-projs/dynamic-calc-proj` | unmodified, for comparison |
| Donor B, SkiDY's Unbound mirror | `D:/antigrav-projs/unbound-calc-reference` | rev `6741d18`. Unbound mechanics. Self-contained, runs offline. The site the owner likes the look of |
| Donor C, hzla's Unbound fork | `D:/antigrav-projs/dynamic-calc-unbound-reference` | rev `eb3226e`. The trainer/species/move data this build loads, from `backups/unbound.js` |
| The ROM | `roms/Pokemon Unbound Official.gba` | md5 `9cad8e771940e7f7094d13911552cef0`, gitignored, never commit it |
| CFRU source | **not on disk** | `git clone --depth 1 https://github.com/Skeli789/Complete-Fire-Red-Upgrade`. Findings here are pinned at `b637a27` (2025-01-24) |

The donors are read-only references. Do not edit them; `check/agreement.js` runs donor B's
engine from source and expects it unmodified.

### Prerequisites

Node (any recent version; built with 22) and Chrome or Edge, which `check/browser.js` finds
at the usual Windows paths. Python 3 with `capstone` if you do ROM disassembly. There is no
`npm install` — `package.json` lists Cypress but it is not installed and the inherited
Cypress suite is not what this work uses.

## Map of the changes

`git diff --stat 1b8da408` includes both committed work and the review fixes. What matters:

**The Unbound title itself**

- `backups/unbound.js` — donor C's data verbatim, wrapped in an IIFE exporting
  `UNBOUND_DONOR`. The wrapper exists because the donor assigns a bare global named
  `pokedex`, which is this application's stock dex. Ends by calling the adapter to build
  `backup_data`.
- `js/unbound_adapter.js` — all the Unbound-specific logic: tier selection from `?m=`,
  the record corrections, the payload handed to `loadDataSource()`, working-table
  isolation, and the tier and field-effect controls. **New Unbound behaviour belongs
  here, not in `showdown_hooks.js`.**
- `backups/title_to_backup_mappings.js`, `index.html` — title registration, the tier
  selector, and the Unbound field-effect controls.

**Generic loader changes in `js/showdown_hooks.js`** — each is driven by a key in the
payload, so no title names were scattered through it: `isolate_tables`, `tier`,
`field_effects`, `custom_poks`, `apply_move_flags`, `extra_abilities`, `ate_bp_mod`, plus
`liquid_voice_no_boost`, and `weightkg`/`nfe` now reaching `SPECIES_BY_ID`.

**Engine changes in `calc/`** — deliberately small: the three field flags in `field.js`,
Vicious Sandstorm / Shadowy Veil / the `-ate` knob in `gen78.js`, Big Mo and the Camomons
helper in `mechanics/util.js`, and two description strings in `desc.js`.

**`js/moveset_import.js`** — two importer fixes, unrelated to Unbound, affecting every title.

### The payload contract

`loadDataSource(data)` is the seam. A title's backup file builds `backup_data` and every
behaviour below is switched on by a key in it, which is why the loader has no Unbound name
in it. Adding a title-specific behaviour means adding a key here, not a title check.

| Key | Effect |
|---|---|
| `formatted_sets`, `poks`, `moves`, `title` | The pre-existing contract: sets, species, moves, display name |
| `tier` | Shows the difficulty selector and pre-selects this tier |
| `isolate_tables` | Override copies of `pokedex` / `moves` / `SPECIES_BY_ID[gen]` / `MOVES_BY_ID[g]` / `abilities` instead of the stock objects |
| `custom_poks` | Create species the stock dex lacks, rather than needing `&customPoks=1` in the URL |
| `apply_move_flags` | Translate the source's flag names (`isPunch`) to the engine's (`flags.punch`), honouring an explicit `false` |
| `extra_abilities` | Add ability names to the selector so a set's ability can actually be chosen |
| `ate_bp_mod` | Base power modifier for the `-ate` abilities; Unbound sets 5325 (1.3x) |
| `liquid_voice_no_boost` | Suppresses A's two inherited Liquid Voice damage boosts for Unbound; retyping remains active |
| `field_effects` | CSS class of the title's own field controls, revealed on load |

Older keys the loader already had (`move_replacements`, `custom_moves`, `poks_replacements`,
`order`) are untouched and still work for other titles.

### ROM offsets

All located by pattern and asserted again at run time, so a different build fails loudly.
They live as named constants in `check/rom.js` and `check/rom-data.js`; repeated here so you
do not have to go looking.

| Table | Offset | Layout |
|---|---|---|
| Species names | `0x166a98c` | stride 11, 1294 entries, index 1 = Bulbasaur |
| Base stats | `0x19e0c9c` | stride 28. Order is HP, Atk, Def, **Speed**, SpA, SpD; types at +6/+7; abilities at +22/+23 and the hidden one at +26 |
| Move names | `0xa40a10` | stride 13, generation 3 spellings (`ThunderPunch`), long names abbreviated (`Dazzle Gleam`) |
| Move data | `0xa769af` | stride 12. Power +1, type +2, **split +10** (0/1/2 = Physical/Special/Status). **Not `0x900000`** — see the traps above |
| Ability names | `0xa36398` | stride 17, DPE's expanded list. Use this for ability ids, not CFRU's header |
| Ability power switch | `0x09cd4e6` | Cases funnel into a shared `(power * r3) / 10` tail at `0x09cd6fc` |

Type ids are FireRed's with Fairy at 23.

**`check/`** — everything test-related, described under Checks above. `check/harness.js`
and `check/browser.js` are the two pieces other checks build on.

## Traps that cost time here

Every one of these produced a confident, wrong answer first.

1. **`calc/mechanics/util.js` contains two copies of its helpers**, one inside a
   `damageGen != 8 && damageGen != 7` guard. Unbound runs the top-level copy. Editing the
   wrong one changes nothing and looks like the edit did not take.
2. **`gen78.js` requires `./custom/util`, which the page never loads**, so those calls
   resolve to `calc/mechanics/util.js` through the shared-`exports` shim. Editing
   `calc/mechanics/custom/util.js` changes nothing in the browser.
3. **The ROM has two move tables that both start with a valid Pound row.** `0x900000` is
   `0xFF` filler past index ~690. The live one is `0xa769af`. Reading the dead one reports
   false differences on Acid, Sucker Punch and everything DPE added.
4. **Browser checks race the page.** Page globals from the *previous* document satisfy a
   readiness expression while the new one is still loading. `session.open()` pins the wait
   to the target URL for this reason; if you add a check that sets a control which
   navigates, use `session.waitFor`, not another `open`.
5. **Ability and hold-effect ids are renumbered by DPE.** Take them from the ROM's own
   expanded ability name table at `0xa36398` (stride 17), not from CFRU's headers. CFRU
   happened to agree for abilities; it did not obviously agree for hold effects.
6. **Automated disassembly inference is unreliable here.** A script mapping the ability
   switch reported Technician as 13 where hand-reading gives 15. Hand-read, then
   corroborate against cases CFRU documents.
7. **Line endings are mixed.** Most files are CRLF; the new ones are LF. Match whatever the
   file already uses or the diff becomes unreadable.
8. **`.gitignore` guards the ROM.** It was broken once by a careless append that joined
   `/tools` and `/roms` into one entry. Check `git check-ignore -v roms/...` before staging
   if you touch it.

## Where to pick up

Roughly in priority order.
These are follow-up options after trying the build, not authorization to begin another
verification project. The owner accepted donor matching for the first build.

1. **Design feedback on the new look.** The first pass is done and pushed; see "The look"
   below. What this item used to say was wrong, and is corrected there: the `min-width`
   values never forced the spread, because the `width <= 1540px` media query cancels them
   and the page already fit at the owner's width. What is left is judgement rather than
   measurement — the field-effect labels, the party rail density, and anything not in the
   measured table. The team previews are kept.
2. **Switch-in prediction**, deferred to a follow-up release by the owner. Section 7 of the
   revised plan has the approach: reuse donor C's `get_next_in_cfru()` and prefer this
   fork's `js/switch_prediction.js`.
3. **The Gem boost**, if you want another ROM constant. Unbound sets carry four kinds of
   Gem and 1.3x versus 1.5x is unresolved. Start from `check/rom-ate.md`, which records the
   procedure that works.
4. **Multi-Attack**, the inherited difference described under "Known and left alone".
   Liquid Voice has a scoped Unbound correction now; it is not an open investigation.
5. **Direct Unbound save import**, still unsupported. Text import is the route.

Things deliberately not done, which you should not start without asking: rebasing onto
upstream, a general data/schema framework, migrating the inherited Cypress suite, and
per-title box storage.

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

**No check covers the `newhd` path.** A blanket pixelated rule shipped and passed all 51
UI checks; the owner caught it by eye. Treat the suites as covering behaviour, not
appearance.

## Checks

```
node check/run.js         # recorded damage fixtures, effects off
node check/mechanics.js   # each ported effect, against donor B on identical inputs
node check/review.js      # duplicate box actions, Camomons updates, weather, Liquid Voice
node check/ui.js          # the real page in headless Chrome (51 checks)
node check/agreement.js <tier>   # optional broad donor comparison
node check/rom-data.js           # optional species/move table comparison against the ROM
```

No `npm install`. `check/ui.js` drives Chrome or Edge over the DevTools protocol and fails on
any uncaught page exception or console error, apart from two pre-existing 404s
(`js/console_watcher.js`, which is referenced by `index.html` but absent from the repository
on `master` too, and `favicon.ico`).

What each piece is:

| File | Does |
|---|---|
| `check/harness.js` | Loads `calc/*` the way `index.html` does — same files, same order, same shared-`exports` shim. Takes a `root`, so it can load donor B too |
| `check/browser.js` | Static server plus headless Chrome over the DevTools protocol, no package install. `withBrowser`, `session.open`, `session.eval`, `session.waitFor` |
| `check/data-load.js` | Builds the Unbound payload in Node without a browser, for data-only questions |
| `check/run.js`, `check/cases/`, `check/fixtures/` | Recorded damage fixtures; `--update` re-records |
| `check/mechanics.js` | Each ported effect on a discriminating case, against donor B |
| `check/agreement.js <tier>` | Every trainer set, this fork in the real page vs donor B |
| `check/ui.js` | The real page: loading, tiers, data seams, isolation, field effects, import |
| `check/rom.js`, `check/rom-data.js` | ROM reading and the data comparison |
| `check/rom-ate.md` | How the `-ate` constant was disassembled — the procedure to reuse |

A ROM check needs `roms/Pokemon Unbound Official.gba` present; the others do not.

The review adds focused checks only. There is no new all-trainer sweep or ROM audit;
the historical results below are not a claim that those broad checks were rerun after
the review. Do not expand verification once the affected checks and baseline pass.

Review verification completed: `node check/run.js`, `node check/mechanics.js`,
`node check/review.js`, and `node check/ui.js` all passed. The existing browser smoke
check covers all three tiers, the Cloud text export, and Renegade Platinum loading.
The focused check covers the changed UI actions and Liquid Voice donor agreement;
it does not establish full engine accuracy. `git diff --check` also passed.

## Review fixes

- Numbered imported sets retain their identity in selected removal and party previews.
  Clear-all removes every imported slot, and smaller re-imports remove stale numbered
  slots from the working dex as well as storage.
- Camomons displays the types returned by the calculation after moves or selected
  Pokemon change. The display does not trigger another calculation.
- Sand Stream preserves an already selected Vicious Sandstorm. Ordinary Sand remains
  ordinary Sand; the change does not automatically infer boss fields from trainer names.
- Unbound's payload disables both inherited Liquid Voice damage boosts. Retyping is
  unchanged, and other titles keep their existing behavior. The focused case matches B.

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
| Difficult | 2839 | 99.30% | 16 | 4 (all four are donor B crashing) |
| Expert | 3040 | 99.57% | 11 | 2 |
| Insane | 3313 | 99.64% | 12 | 0 |

The Difficult row was re-run on 2026-09-13 and reads 99.30% with 4 unexplained, where this
table previously recorded 99.26% with 5. One real disagreement was resolved between that
figure being written and the integration commit. **Expert and Insane have not been re-run
since, so assume they carry the same staleness.**

Agreement is *lower* than it was before the ROM check, deliberately. Where the cartridge
says both donors are wrong, this calculator follows the cartridge.

The original donor comparison reported matching species base stats/types and move data
before the ROM-based move-power overrides. The final loaded Hydro Pump and Aura Sphere
powers intentionally differ. Historical trainer-set differences include the corrections
and exclusions described above; the comparison is not proof of in-game trainer accuracy.

This table records the pre-review run. Its unexplained column includes the Liquid Voice
difference now corrected for Unbound. Counts were not recomputed in the focused review.

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
