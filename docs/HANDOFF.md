# Dynamic Calc handoff

Updated 2026-09-13 after the panel sprite and two-column layout fixes and a repository cleanup.
This is the current entry point for an agent arriving without conversation history.

## Current state and scope

This static multi-title calculator now includes Unbound data, three difficulty tiers,
field effects, text import, and the compact geometry layer. Expert is the default.
Unbound switch-in prediction and direct Unbound save import remain deferred.

Trainer collections after documented exclusions contain 223 species / 355 sets on
Difficult, 240 / 380 on Expert, and 265 / 415 on Insane, before imported box entries.

Working directory: `D:/antigrav-projs/dynamic-calc-merge-opus`; branch: `master`,
tracking `origin/master` at `https://github.com/fumbar/Dynamic-Calc.git`; integration
baseline: `1b8da408`. The `dynamic-calc-merge-opus` branch is an ancestor of `master` and
no longer moves; work lands on `master` and is pushed from there. The most recent code
change is `100af961`, the panel sprite and two-column layout work; `d61b3032` then removed
two orphaned pages (`mastersheet.html`, which loaded a `mastersheet_files/` directory the
repository does not contain, and `ss.html`, an unreferenced copy of the Sterling Silver
sheet) and two stray screenshots. Nothing is pending. Run `git status --short` and
`git log -6 --oneline` when you arrive; preserve pending work. Do not rebase onto upstream
(ADR 0001).

Read next as needed:

- [RUNTIME-TRACE.md](RUNTIME-TRACE.md) before editing `calc/`.
- [AUDIT-2026-09-13.md](AUDIT-2026-09-13.md) for resolved findings and remaining constraints.
- [UNBOUND-IMPLEMENTATION-NOTES.md](UNBOUND-IMPLEMENTATION-NOTES.md) for detailed corrections,
  ROM evidence, donor comparisons, exclusions, and layout history.
- [IMPLEMENTATION-PLAN-REVISED.md](IMPLEMENTATION-PLAN-REVISED.md) for historical owner decisions,
  not a current task list; [CONTEXT.md](../CONTEXT.md) for vocabulary.

ADRs preserve [no upstream rebase](adr/0001-long-lived-fork-no-upstream-rebase.md),
[ROM authority](adr/0002-unbound-ground-truth-from-rom.md),
[donor matching as the first-build bar](adr/0003-donor-matching-accepted-for-first-build.md),
and [bounded ROM verification](adr/0004-rom-checked-data-layer.md).

## Run it

Serve the repository root over HTTP. `node serve.js 8000` is in the repository and needs
nothing installed; `pokecalc.ps1` / `pokecalc.bat` wrap it with start/stop/status and pick
the next free port. Any static server works, for example `python -m http.server 8000`,
though the Windows `python` alias may not resolve. No application build or dependency
install is required. Do not open via `file://`.

```text
http://localhost:8000/index.html?data=unbound&gen=8&dmgGen=8&types=6
```

Add `&m=difficult` or `&m=insane`; absent or invalid values select Expert.
Browser checks require Node 22 or later with built-in WebSocket support and Chrome or Edge
at the paths in `check/browser.js`. The inherited npm/Cypress/TypeScript scripts are not
the verification route for this fork.

## Current navigation and import behavior

- Unbound's dropdown option opens this build at Expert. Tier selection reloads with `m=`.
  Saved opponents are validated against the loaded species/set pair, including direct
  tier URLs. Missing opponents are dropped; valid ones are restored. The imported box
  and left selection are retained independently.
- Under the existing `IS_LOCAL` loopback-host guard, dropdown data IDs found in both
  `SOURCES` and `backupFiles` load through `./index.html` with their existing parameters.
  Unmapped entries retain hosted URLs and display `(external)`. Emerald Kaizo's dropdown,
  for example, uses an unmapped decomp ID despite a legacy backup existing here.
  Do not blindly rewrite decomp IDs.
- Other hostnames, including LAN addresses and deployed sites, retain inherited routes
  and redirects for other titles. Same-origin hosted navigation is not implemented or
  verified. Shared storage belongs to the origin; external calculators do not receive it.
- The opposing rail ranks a trainer's remaining team by each Pokemon's best move against
  the left side and marks that move in red. The score is base power times type
  effectiveness, plus STAB, Technician, ability immunities, Soundproof, multi-hit counts
  and the situational doublings (Acrobatics, Hex, Brine, Dream Eater, Wake-Up Slap);
  Explosion and Self-Destruct score zero. It is a ranking heuristic, not a damage calc:
  no stats, defenses, items or boosts. Beat Up, the always-crit moves and Weather Ball
  stay behind the Cascade White 2 gate, the first two because they are wrong as written
  and the third because the weather read there takes the first of two checked inputs.
  Unbound switch-in ordering itself is still unverified against the game.
- Text import is the Unbound workflow. `docs/example_box.txt` is the owner's real Cloud
  export: 18 Pokémon, 17 species, nicknames, and two Pyroar. Duplicate species use numbered
  `My Box` slots. Existing save readers for other titles remain; Unbound's save control is hidden.

## Implementation map

| Area | Files |
|---|---|
| Donor C data retained as `UNBOUND_DONOR` | `backups/unbound.js` |
| Unbound corrections, tier payload, field UI | `js/unbound_adapter.js` |
| Shared loader, local title options, saved opponent validation | `js/showdown_hooks.js` |
| Title registration | `SOURCES` in `index.html` and `showdown_hooks.js`; `backups/title_to_backup_mappings.js` |
| Text import and duplicate slots | `js/moveset_import.js`; box actions also in `showdown_hooks.js` |
| Main calculation and field construction | `js/index_randoms_controls.js`, `js/shared_controls.js` |
| Active Unbound mechanics | `calc/mechanics/gen78.js`, top-level helpers in `calc/mechanics/util.js` |
| Field cloning and descriptions | `calc/field.js`, `calc/desc.js` |
| Compact layout | `css/layout-b.css`, loaded last on `index.html` only |

The seam is `loadDataSource(data)`. Legacy keys include `formatted_sets`, `poks`, `moves`,
`title`, replacement maps, `custom_moves`, and `order`. Unbound opts into `isolate_tables`,
`custom_poks`, `apply_move_flags`, `extra_abilities`, `tier`, `field_effects`,
`ate_bp_mod: 5325`, and `liquid_voice_no_boost: true`. These keys are not a general schema:
helpers still live in the Unbound adapter, which other HTML entry points do not all load.
Keep title-specific logic in its adapter; extract shared helpers when a real consumer needs them.

## Checks and evidence

Run relevant checks, then stop unless a failure or concrete concern warrants more.

| Command | Scope / prerequisites |
|---|---|
| `node check/run.js` | Six recorded baseline damage cases; Node only |
| `node check/ui.js` | Browser: tiers, restoration, actual local dropdown navigation, box retention, data seams, effects, switch-in move scoring, Cloud import |
| `node check/review.js` | Browser and donor B: duplicate box actions, Camomons, weather, Liquid Voice |
| `node check/mechanics.js` | Node and donor B: discriminating cases for ported effects |
| `node check/geometry.js` | Browser and donor B: computed sizes/styles at 1276px and 1126px |
| `node check/audit-probe.js` | Diagnostic output for five titles; per-title errors are printed, not asserted |
| `node check/agreement.js <tier>` | Optional broad donor comparison; browser and donor B |
| `node check/rom-data.js` | Optional species/move comparison; requires the pinned ROM |

`check/browser.js`, `check/harness.js`, `check/calc-case.js` and `check/data-load.js` are
shared helpers the entry points above require, not checks to run on their own.

Latest change set, CSS only: the panel sprite is sized from `--poke-sprite-size` and
`--poke-sprite-top` on `.poke-info` rather than a fixed box per breakpoint, and the
`width <= 1180px` block was resized so `#player-tags` and the set selector stop colliding
with the fields. `node check/ui.js` and `node check/geometry.js` passed afterwards. Freedom
from overlap was measured directly in headless Chrome from 700px to 1920px; those
measurements were one-off probes, not recorded checks, so the geometry check still covers
only the styles listed below. No engine or ROM-data change occurred, so broad sweeps and ROM
analysis were not repeated.

The preceding navigation review: baseline and expanded UI checks passed, and the audit probe
loaded Unbound, Renegade Platinum, Blaze Black, Inclement Emerald, and Fire Red without
unexpected logged page errors. The audit before it also passed mechanics and review suites.

Earlier dated stdout in `check/results/` records geometry and donor agreement: 99.30%
Difficult, 99.61% Expert, 99.64% Insane. Those runs are historical evidence, not fresh
verification of every later edit. Detailed counts are in the implementation notes.
Donor agreement does not prove ROM accuracy; no full engine verification is claimed.

Browser-check traps: `session.open()` requires exact URL equality; older-generation pages
sort query parameters, so use canonical ordering. Use `waitFor` after a control navigates.
UI checks tolerate the inherited missing `console_watcher.js` and favicon requests, not
arbitrary errors. Sandboxed browser execution can stall; use the normal approval mechanism
when outside-sandbox execution is necessary. Geometry checks measure panel and `pokesprite`
styles, not `newhd` box tiles or rendered-image appearance.

## Known limits affecting use

- Expert Light of Ruin Vega, level 47, has five known team members rather than six because
  a malformed donor species is quarantined. Two Science Society side-battle records are
  quarantined in every tier. Restore only with species evidence and an explicit correction.
- Pupitar's `Bad Tantrum` slot in level-47 Rival 4 (player chose Gible) remains blank in
  every tier. See the implementation notes for exact records and corrected aliases.
- Hydro Pump 120, Aura Sphere 90, and the 1.3x `-ate` modifier are ROM-backed adjustments.
  Gem strength remains unresolved; the rest of the formula is not fully verified.
- The inherited Multi-Attack implementation derives move type from the user rather than
  correctly deriving both move/user typing from its Memory. The recorded Silvally case
  receives the expected STAB by that route; other configurations may differ.
- Table isolation is opt-in. Older titles mutate stock tables within a page; full-page
  navigation resets them. Same-document title switching is not supported.
- Custom moves still go into `MOVES_BY_ID[8]`; text import recognizes species through
  `calc.SPECIES[8]`, so active-title-only custom species can be skipped. Optional move
  properties still use legacy truthy checks. These constraints remain open.
- Unbound's Big Mo and Vicious Sandstorm speed helpers target its supported gen-8 path;
  the duplicated lower-generation helper is not an additional supported configuration.
- Sprite filenames are percent-encoded at every construction site, and the species-derived
  name drops `%` to match the assets, so `Zygarde-10%` resolves in all four sprite
  directories. `img/pokesprite/zygarde-10%.png` is now unreferenced; the `%`-free file
  beside it is a different image of the same forme.

## Local references and guardrails

| Reference | Location / revision |
|---|---|
| Original fork for comparison | `D:/antigrav-projs/dynamic-calc-proj`; baseline `1b8da408` |
| Donor B, SkiDY mirror | `D:/antigrav-projs/unbound-calc-reference`, `6741d18` |
| Donor C, hzla Unbound | `D:/antigrav-projs/dynamic-calc-unbound-reference`, `eb3226e` |
| Unbound ROM | `roms/Pokemon Unbound Official.gba`, owner-identified 2.1.1.1; MD5 `9cad8e771940e7f7094d13911552cef0` |
| CFRU evidence | Source revision `b637a27`; not required for routine checks |

Donor checkouts are read-only. Never commit the gitignored ROM; verify its hash when using
it as evidence. Offsets and assertions live in `check/rom.js` and `check/rom-data.js`;
the disassembly procedure is in `check/rom-ate.md`. Two ROM move tables start with Pound;
the live expanded table is `0xa769af`, not the dead table at `0x900000`.

Preserve mixed line endings. The browser's shared `exports` shim ignores require paths:
`gen78.js` uses helpers in `calc/mechanics/util.js`, not `calc/mechanics/custom/util.js`.
Read the runtime trace before editing mechanics.

Further design feedback, Unbound prediction, direct save parsing, ROM extraction, per-title
storage, schema tooling, and full engine verification are follow-up work. Historical plans
and feature ideas do not authorize starting those projects. Preserve the shared box and
team previews; donor matching remains the accepted first-build bar.
