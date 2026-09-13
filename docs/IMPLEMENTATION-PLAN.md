# Unbound Merge — Implementation Plan

**Audience:** a coding session starting cold, with no access to the conversation that produced this.
Everything needed to begin is in this file or the files it points at.

**Goal:** fold the best of three Pokémon damage calculators into this fork — Unbound-specific field
effects, Unbound data with difficulty tiers, CFRU switch-in prediction, and a tighter layout —
without losing battle engine accuracy or the features this fork already has.

Read [`CONTEXT.md`](../CONTEXT.md) first for vocabulary. Terms below are used in its exact sense
(*title*, *stock dex*, *trainer set*, *difficulty tier*, *switch-in prediction*, *bait score*,
*ground truth*, *CFRU*, *DPE*).

---

## 1. The three codebases

All three are on disk and all three run locally. They are referred to throughout as A, B and C.

| | Path | Git | Serve on |
|---|---|---|---|
| **A** — this fork, the trunk | `D:\antigrav-projs\dynamic-calc-proj` | `master` @ `1b8da408`, origin `fumbar/Dynamic-Calc` | `:8080` |
| **B** — SkiDY's Unbound calc | `D:\antigrav-projs\unbound-calc-reference` | `main` @ `6741d18`, no remote | `:8081` |
| **C** — hzla Unbound branch | `D:\antigrav-projs\dynamic-calc-unbound-reference` | `unbound` @ `eb3226e`, origin `hzla/Dynamic-Calc-Unbound` | `:8082` |

To run any of them: `npx --yes http-server -p <port> -c-1` from its directory. They are static sites;
there is no build step. Do not open `index.html` via `file://` — the data loading needs HTTP.

**B is a mirror of a deployed site, not a clone of a source repo.** No public source repo exists —
GitHub code search for its distinctive `SETDEX_INSANE` global returns zero results. It is a snapshot
with one commit, byte-faithful to what the site serves (`.gitattributes` disables EOL translation).
`aes.js` in it is ByetHost anti-bot cruft, not app code.

**A and C are cousins; B is a different lineage.** A and C both descend from Dynamic-Calc — both ship
`calc/mechanics/custom/`, `util8.js`, `result8.js`, `state.js`, the `backups/` system and the sprite
set. B is built on an older, leaner Smogon `damage-calc`: no gen 9, one HTML page, 481-line stylesheet.
This is why porting *mechanics* from B costs more than porting *UI* from B.

### The ROM

`roms/Pokemon Unbound Official.gba` — 33,554,432 bytes, md5 `9cad8e771940e7f7094d13911552cef0`.
Internal header reads `POKEMON FIRE` / `BPRE` / maker `01`, i.e. it retains the stock FireRed (US)
header, as CFRU hacks do. The Unbound version is **2.1.1.1** (stated by the repo owner; the ROM
carries no ASCII version string because GBA Pokémon text uses a custom encoding). Verify the md5
before trusting any golden numbers captured against it.

---

## 2. Ground rules

These are settled. Do not relitigate them without asking.

- **Battle engine accuracy is the governing constraint.** It outranks schedule and outranks visual work.
- **This stays a multi-ROM calculator.** Unbound is the only title in active use right now, but the
  multi-title architecture stays. Nothing may be hardcoded to Unbound.
- **The stock dex always survives.** Unbound's species and move data is a per-title namespaced overlay,
  never a global replacement. The failure mode must be "Unbound data missing", never "Ampharos has the
  wrong base stats in Renegade Platinum".
- **Ground truth is the ROM.** Not agreement between A, B and C — they share ancestors and share
  mistakes. See [`adr/0002`](adr/0002-unbound-ground-truth-from-rom.md).
- **Work lands on a branch named `unbound-merge`.** No whole-tree rebasing onto upstream. See
  [`adr/0001`](adr/0001-long-lived-fork-no-upstream-rebase.md).
- **Out of scope:** ROM data extraction (see [`FEATURE_IDEAS.md`](../FEATURE_IDEAS.md)),
  pokeemerald-expansion as a ground-truth source, and anything for titles other than Unbound.

### One decision still open

**Whether the switch-in prediction port (phase 5) belongs in the first build or the second.**
This plan assumes the **second** — it is the largest and least mechanical port, and bait scores are
computed from damage numbers, so verifying it before the damage pipeline is verified means measuring
against a moving target. **Confirm with the repo owner before starting phase 5.** If it must be in the
first build, it still runs after phase 4, not earlier.

---

## 3. Phase 0 — Housekeeping

**Do this first; it takes minutes and one item is urgent.**

1. **Gitignore the ROM.** `roms/` is currently untracked but *not* ignored, so the next `git add -A`
   commits a 32 MB commercial ROM derivative into history permanently. Add `roms/` to `.gitignore`
   before touching anything else.
2. Create and switch to the branch: `git checkout -b unbound-merge`.
3. Add the upstream remote for cherry-picking: `git remote add upstream https://github.com/hzla/Dynamic-Calc.git`.
   Do not rebase onto it.
4. Note the working tree currently has uncommitted `CONTEXT.md`, `docs/` and a modified
   `FEATURE_IDEAS.md`. Commit those before starting.

---

## 4. Phase 1a — Load Unbound data into A

**Runs in parallel with phase 1b. Bounded and fully diagnosed; no research needed.**

The data source is **C's `backups/unbound.js`** (919 KB), not the npoint service. Copy it into A's
`backups/`. It defines three globals: `formatted_sets` (keyed `difficult`/`expert`/`insane`),
`pokedex` (1,242 entries), and `unbound_moves` (873).

Use C's packaging rather than B's. Both datasets are identical in coverage — 225 species/357 sets
(Difficult), 243/383 (Expert), 267/417 (Insane) — but C names a set `"Lvl 19 Leader Mirskle"` where B
names it `"Leader Mirskle"`. That `Lvl LEVEL ` prefix is the convention A already parses to group
trainers and draw the enemy rail. Using B's flat names would mean re-deriving every level and trainer
boundary.

A's `loadDataSource()` (`js/showdown_hooks.js:789`) accepts `formatted_sets`, `poks` and `moves`, plus
optional `title`, `poks_replacements`, `move_replacements`, `order`, `encs`, `includes`. The Unbound
data maps onto this directly: `poks` ← `pokedex`, `moves` ← `unbound_moves`.

### Three defects to handle

These were found by feeding the real dataset through A's loader in a browser. All three are confirmed,
not theoretical.

1. **Global collision.** C's data file defines a global `pokedex`; so does A. Loading it unscoped
   clobbers A's. Namespace it on load.
2. **39 species crash the loader.** `js/showdown_hooks.js:1058` does
   `SPECIES_BY_ID[gen][pok_id].types = ...` with no existence check. 39 of Unbound's 1,242 species are
   absent from A's gen-8 table — almost all G-Max forms, plus `Flabébé`, which fails on its accented
   characters. Symptom: `TypeError: Cannot set properties of undefined (setting 'types')`. Guard the write.
3. **Three malformed species keys.** The dataset has trainer/battle names sitting in the species slot:
   `"Supply and Demand"`, `"Rogue Electivire"`, and `"[2nd"` (Expert tier only). Upstream parsing bugs.
   Skip or correct them on load.

### Done when

Loading A with the Unbound data yields 267 species in `setdex` for the Insane tier, 417 parsed trainer
entries in `TR_NAMES`, the enemy trainer rail drawing with sprites, and **zero** console errors.
(Everything except the crash already worked in testing — tiers parsed, `setdex` filled, and trainers
resolved as `"Lvl 19 Leader Mirskle"`, `"Lvl 45 Light of Ruin Vega"`.)

### Do not

Do not use npoint bin `68bfb2ccba14b7f6b1f0`. C's own links label it "Unbound 2.1.1", but that bin now
serves **Inclement Emerald** — it contains Roxanne and Keira and no trace of Mirskle. A labels the same
ID "Inclement Emerald", which is correct. C's real Unbound data has always been the local file.

---

## 5. Phase 1b — Read CFRU for gen-8 deviations

**Runs in parallel with phase 1a. Open-ended research; start it early.**

Both B and C compute Unbound with **gen 8** mechanics (B defaults `gen = 8`; C passes `dmgGen=8`). But
Unbound runs on CFRU — a Gen 3 engine with later mechanics selectively backported — so wherever CFRU
deviates from gen 8, *both references are confidently wrong in the same direction*, and no amount of
A-vs-B-vs-C comparison can reveal it.

Clone CFRU and DPE next to the other references:

- `https://github.com/Skeli789/Complete-Fire-Red-Upgrade`
- `https://github.com/Skeli789/Dynamic-Pokemon-Expansion`

Read CFRU's damage code and produce **a list of every place it differs from gen 8 mechanics** — damage
formula rounding order, stat-stage application, crit multiplier and crit stage behaviour, weather and
terrain interaction, burn, type-effectiveness handling, ability and item timing. That list is the
hypothesis set for phase 4; it is not itself an answer, because Unbound may deviate from stock CFRU by
an unknown amount.

Deliverable: a written list of candidate deviations, each with the CFRU source location and what gen 8
does instead.

---

## 6. Phase 2 — Difficulty tiers

Small, self-contained, and it makes phase 1a visible. Adopt C's approach: `MODE = params.get('m')`
(`js/showdown_hooks.js:2092` in C) selecting `setdex = formatted_sets[MODE]`
(C's `js/showdown_hooks.js:2106`, `2256-2257`).

Tier must be per-title, not global — other titles have no tiers and must be unaffected.

**Held decision:** where the tier selector sits relative to the existing ROM dropdown, and whether tier
lives in the URL (`?m=insane`, as C does) or in persisted state. This is design-side and gated behind
verification. Wire the mechanism now; leave the control somewhere plain and revisit in phase 6.

---

## 7. Phase 3 — Unbound field effects

**Port from B. Not from C.** This is counterintuitive and matters.

Five effects are genuinely Unbound-specific. A has none of them. C has UI for all five but working
mechanics for only three:

| Effect | B | C | Port source |
|---|---|---|---|
| Vicious Sandstorm | complete | partial — missing Sand Rush speed and damage description | **B** |
| Elias's Shadowy Veil | complete | partial — mechanics present, description text missing | **B** |
| Mel's Inverse Battle | complete | complete | either |
| Big Mo's Weight Trick Room | complete | **dead flag** — declared and read from UI, no mechanics consume it | **B** |
| Tessy's Camomons Battle | complete | **dead flag** — declared and read from UI, no logic | **B** |

Note that Steelsurge, Wildfire, Cannonade, Volcalith and Vine Lash are **stock gen 8 G-Max effects**,
not Unbound-specific. All three codebases already have them. Do not port them.

### What to take from where

**From C — the field flags' shape only.** C's `calc/field.js` differs from A's by 21 lines; three of
them are `isBigMoField`, `isShadowyVeil`, `isCamomonsBattle` (`isInverseBattle` already exists in both).
Add those three to A's `Field` class and its serialisation.

**From B — every mechanic that reads them:**

- Vicious Sandstorm: `calc/mechanics/gen78.js` (lines 67, 625, 686, 898), `calc/mechanics/gen56.js:315`,
  `calc/mechanics/util.js:137` (Sand Rush speed), `calc/desc.js:373`, and
  `js/shared_controls.js:249` (auto-weather).
- Big Mo: `calc/mechanics/util.js:122` — inside `getFinalSpeed`, replaces the speed stat with
  `getModifiedStat(getWeightFactor(pokemon) * pokemon.weightkg, pokemon.boosts.spe, gen)`.
- Camomons: `js/shared_controls.js:510` `UpdateCamomons()` plus its `#camomons` change handler — a
  UI-level function that rewrites each side's types from the types of its first two moves.
- Shadowy Veil: `calc/mechanics/gen78.js:988` plus the description string at `calc/desc.js:756`.
- Inverse Battle: `calc/mechanics/gen78.js:159`.

### Risk

B is an older engine. A's `gen78.js` is 341 lines apart from C's and further from B's, so these hunks
will not apply cleanly. Check each one against A's surrounding code rather than pasting. **Every ported
mechanic is a hypothesis until phase 4 confirms it against the ROM** — B being complete does not make
B correct.

### A-only features these files must not disturb

C is an older sibling, not a superset. If you ever find yourself copying a whole file from C over A's,
stop. Only A has:

- Badge and buff modifiers in `calc/field.js` — `isBadgeAtk/Def/Speed/Spec`, `isFlowerGift`, and
  `is10Buff` … `is50Buff`.
- `frags.html` and `js/fragsheet/`.
- `js/battle_notes.js`, `js/move_choice_ai/`, `js/balance_testing.js`.
- `js/savereader_pokeemerald.js` and `js/save_constants/`.
- `js/rom_specific_configs.js`, `js/switch_prediction.js`.
- Gen 9 sets; nine HTML pages against C's seven.

One thing worth taking the other way: C's `calc/move.js` has a five-line `naturepower` case A lacks.

---

## 8. Phase 4 — Verification

**This is the phase the whole plan exists to protect.** Scope: the five Unbound field effects **plus
the full damage pipeline for Unbound** — abilities, items, type chart, stat stages, crit. Switch-in
scoring is explicitly a later pass.

Method is hybrid, per [`adr/0002`](adr/0002-unbound-ground-truth-from-rom.md):

1. Take the phase 1b deviation list.
2. For each candidate deviation, construct a concrete battle case (attacker, defender, move, field state).
3. Run each case in **A** and record the damage roll.
4. Run each case in the **ROM** in an emulator and record what the game actually does.
5. Where they differ, the ROM wins. Fix A.

Three-way comparison against B and C is a **secondary** check, and it has a sharp limit worth
understanding: A cannot be compared with B and C on Unbound field effects, because A does not have
them until phase 3. B and C agreeing proves only that they share an ancestor. Use A-vs-B-vs-C to catch
*regressions* in shared vanilla mechanics during the port — a damage number that changed when it
shouldn't have — and use the ROM for everything about correctness.

Expect legitimate A-vs-B disagreement on stock mechanics: B is an older engine. Log those as drift,
not as port failures, unless the ROM says otherwise.

Practical notes: capture golden numbers as a checked-in fixture so they survive the session. This fork
already has `cypress.config.js` with per-calc fixtures (`testTrainer`, `testTrainerMonFirstMove`),
though `node_modules` has never been installed — Cypress is a reasonable home for these, but a plain
script is fine too. Driving the calcs headlessly works: Chrome is at
`C:/Program Files/Google/Chrome/Application/chrome.exe` and `puppeteer-core` drives it without
downloading a browser. The species pickers are select2 widgets — set them by typing into the search box
and pressing Enter, not by setting `.val()`, which silently does nothing.

### Done when

Every candidate deviation from phase 1b has been tested against the ROM, and A reproduces the ROM's
numbers for all of them.

---

## 9. Phase 5 — Switch-in prediction

**Confirm the open decision in §2 before starting.**

A cannot do this today. A's `js/switch_prediction.js` (583 lines) dispatches on `switchIn == 4` and
`switchIn == 3` only, with zero references to CFRU anywhere in `js/`. C's version lives inline in
`js/showdown_hooks.js` and adds `switchIn == 10` → `get_next_in_cfru()` (C's line 1132) and
`switchIn == 11` → `get_next_in_pkem()` (line 947, which delegates to the CFRU routine). Dispatch is at
C's line 1514. Unbound uses `switchIn=11`.

Port `get_next_in_cfru()` and `get_next_in_pkem()` **as they exist** — minimal modification, per the
repo owner. Bring the UI with them: C's `#refresh-baits` control ("Get Bait Scores"), the per-Pokémon
`Bait Score` display (C's `js/shared_controls.js:555`), and the recompute triggers on current-HP blur
and hazard toggles (`js/shared_controls.js:565-584`).

This is the largest port in the merge — `showdown_hooks.js` is where A and C diverge by 2,288 changed
lines, largely because C keeps this engine inline while A moved its own out to a separate file. Decide
deliberately whether the ported functions join A's `switch_prediction.js` or stay in `showdown_hooks.js`;
"keep as-is" argues for the latter.

**Parked contradiction to resolve here:** pokeemerald-expansion is out of scope as a ground-truth
source, yet the function Unbound actually uses is named `pkem` after pokeemerald. Either the naming is
vestigial or the switch-in logic genuinely derives from pokeemerald. Settle this before porting, since
it determines whether pokeemerald source is needed after all.

Verifying bait-score arithmetic is a separate pass after this, and it depends on phase 4 being done.

---

## 10. Phase 6 — Layout and design

Gated behind verification by explicit instruction: *"this will require more focused design prototyping
that can come after we verify the mathematical aspects of the calculator."*

**The cheap win, available any time and independent of everything else:** A's `.wrapper` sets
`width: calc(100vw - 40px)`, `max-width: 1720px`, `min-width: 1540px`, and `.panel` sets
`font-size: 18px`. Dropping the 1540px floor and the 18px panel font recovers most of B's density with
no JavaScript touched, and makes the calculator usable at half-screen, which it currently is not.

**The real problem, which needs prototyping:** B's tightness comes from a 1285px cap with no minimum,
fixed-em float columns (`.panel` 30em, `.field-info` 27.5em), and a 481-line stylesheet with no flex,
no grid and no media queries. But B achieves it partly by rendering **no team sprites at all** — it
ships one logo image against A's 1,777 sprites. A's team rails and B's density are in direct tension.

Options previously sketched, in rough order of preference: shrink the rails to a denser sprite size and
keep them always-on; failing that, make them collapsible or overlay. A preview you have to open is not
a preview. Rails below the calc rather than beside it is a third option.

Also unresolved here: where the difficulty-tier selector sits relative to the ROM dropdown, and whether
tier is a URL param.

---

## 11. Verified facts worth not re-deriving

Everything here was checked directly. Line numbers are from the working copies described in §1.

- A's data contract: `loadDataSource()` at `js/showdown_hooks.js:789`; species injection loop writing
  `SPECIES_BY_ID[gen][pok_id].types` at `:1058`; `SOURCES` map at `index.html:34` and
  `js/showdown_hooks.js:1201`.
- A's trainer parsing works on the Unbound data unmodified — 417 entries resolved from Insane tier set
  names alone, with no `trainers` object in the data. Trainer identity lives entirely in set names.
- Unbound's `pokedex` entry shape is `{types, bs, weightkg, nfe, abilities}` — the same shape A's
  `poks` expects.
- npoint bin `68bfb2ccba14b7f6b1f0` is live and returns 978 KB, but it is Inclement Emerald
  (`poks` 1212, `moves` 755, `formatted_sets` 640). Not Unbound.
- A's `calc/` layer is very close to C's: `field.js` 21 changed lines, `desc.js` 14, `move.js` 5.
  `gen78.js` is 341, `css/main.css` 674, `index.html` 822, `showdown_hooks.js` 2,288.
- Sprite counts: A 1,777, C 1,602, B 0.
- A ships a local-hosting patch (`IS_LOCAL` in `js/showdown_hooks.js`) that suppresses nine hosted
  redirects to `hzla.github.io` when `location.hostname` is localhost. Without it, nine titles —
  Renegade Platinum among them — navigate off the local server instead of loading their bundled
  `backups/` data. C's branch has no such redirects and needs no patch.

---

## 12. Traps

- **Mixed line endings.** `js/showdown_hooks.js` contains both CRLF and LF lines. Tools that normalise
  EOL will produce enormous phantom diffs. Match the surrounding lines when editing.
- **Do not `cat` the data files.** `backups/*.js` run to megabytes on very long lines.
- **B's mirror is not a source repo.** Do not try to `git pull` it or look for an upstream.
- **Trainer levels in the Unbound data can be negative** (`"Lvl -2 Hideo "`). This appears to be a
  level-offset encoding. Do not "fix" it without understanding it.
- **Set names carry trailing spaces** (`"Lvl 19 Leader Mirskle "`). Trim carefully — the trailing space
  is part of the existing convention and other titles may depend on it.
