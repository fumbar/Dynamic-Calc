# Unbound merge: integration plan

Status: first-build scope settled through owner discussion, September 12, 2026.
Planning only; implementation has not started.

This is the proposed replacement for the sequencing and acceptance criteria in
[the original plan](IMPLEMENTATION-PLAN.md). Keep that document as the source inventory
and historical investigation record. Read [CONTEXT.md](../CONTEXT.md) for terminology.
Section 9 records owner decisions and deferred questions for the coding handoff.

## 1. Approach and scope

Integrate existing work into this fork. A already supplies the battle engine and the
multi-title application; B supplies implemented Unbound effects; C supplies compatible
trainer data and switch-in prediction. Reuse these implementations and verify the seams
we change. A full engine audit, a new data platform, and exhaustive ROM testing are not
prerequisites for this merge.

Accuracy remains the priority. Existing mechanics are the working baseline, not a claim
of universal correctness. The ROM settles a concrete mechanics dispute; agreement with a
donor establishes port fidelity, not independent proof of game behavior.

Preserve the stock dex, other titles, local-hosting behavior, team rails, save/import
features, notes, and A's badge/buff modifiers. Keep title-specific behavior gated by the
active title configuration. Unbound-specific data and rules are expected; scattering
title-name conditions across unrelated code is not.

Work on `unbound-merge`, without rebasing onto upstream. ROM extraction, new support for
other titles, engine modernization, and a general schema/editor framework remain out of
scope. Layout follows the mathematical integration milestone. Prediction's release
is deferred to a follow-up release, as confirmed by the owner. It does not block the
first usable build of data, difficulty tiers, and field effects.

The owner accepts matching donor calculations for the first build. This narrows the broad
CFRU investigation in the original plan and ADR 0002 to targeted investigation when
evidence warrants it. The ROM's authority is unchanged. Full engine verification remains
optional future work, not a release prerequisite. Preserve reproducible fixtures and
donor provenance so that later verification can extend the existing work. Record this
revised scope in a follow-up ADR during implementation; retain the historical decision.

## 2. Sources and practical constraints

| Role | Local source | Use |
|---|---|---|
| A: destination | `D:/antigrav-projs/dynamic-calc-proj` | Retain application and engine |
| B: SkiDY mirror | `D:/antigrav-projs/unbound-calc-reference` | Unbound mechanics and associated UI wiring |
| C: hzla Unbound | `D:/antigrav-projs/dynamic-calc-unbound-reference` | `backups/unbound.js`, field flag shape, prediction |

Recorded revisions are A `1b8da408`, B `6741d18`, C `eb3226e`. Check for subsequent
changes once at implementation start. B is a deployed-site snapshot; treat it as a local
donor, not a repository to update. Preserve relevant attribution when copying code/data.

Use C's local Unbound data. Do not reuse npoint ID `68bfb2ccba14b7f6b1f0`: the original
investigation found it serving Inclement Emerald. No remote data lookup is needed here.

The local ROM is `roms/Pokemon Unbound Official.gba`, owner-identified as 2.1.1.1, with
recorded MD5 `9cad8e771940e7f7094d13911552cef0`. Verify its hash only when using it for
observations. Data version compatibility is not established merely by this ROM version.

Serve the static sites over HTTP using available local tooling; no application build is
required. Do not assume the inherited `calc/package.json` build/test scripts work: they
reference a TypeScript source/build setup absent from the inspected tree. Avoid making
toolchain restoration a separate project. Preserve mixed line endings in edited files.

## 3. Milestone A: prepare a small, trustworthy baseline

1. Inspect the working tree and existing branch/remotes. Ignore `roms/` before staging
   implementation work. Preserve the owner's pending documents and feature ideas; use
   explicit file staging and keep planning changes separate from code changes.
2. Create or reuse `unbound-merge`. An upstream remote is useful only if a specific
   cherry-pick is needed; adding or fetching it is not an integration prerequisite.
3. Identify the active browser calculation path for `gen=8&dmgGen=8` and note it in the
   implementation handoff. This is a brief trace, not a module-system refactor.
4. Capture a few representative A calculation results before changes, including a
   commonly used existing title. Reuse available UI checks where they actually run.

Runtime caution: `index.html` provides a shared `exports` object and a `require()` shim
that ignores paths. `gen78.js` references `custom/util`, but the page loads
`calc/mechanics/util.js`, which contains generation-dependent helper implementations.
A Node import can therefore exercise different helpers. Initially use the loaded browser
`calc` API for numeric fixtures, with explicit inputs. Use UI automation only to check
UI wiring. Do not maintain duplicate Node and browser harnesses for this port.

Existing Cypress tests suppress uncaught exceptions, and configuration disables test
isolation. New merge checks must fail on unexpected app exceptions and use controlled
storage. Do not overhaul the entire old suite as a prerequisite.

Done when: the coding agent knows which code executes and can reproduce the selected
baseline cases. No extensive regression suite or emulator setup is required to start.

## 4. Milestone B: data and difficulty as one integration

### Owner's playthrough and import workflow

The owner believes they have four badges and has just completed the fight where the
villain captures Zapdos on the mountain near Epiphany Town. This is an approximate
progress marker, not a verified battle identity. Prefer Expert difficult battles around
this point for examples; do not guess upcoming boss identities or require progression
research before coding.

Text import, including box/party exports from Unbound Cloud, is the accepted first-build
workflow. Check one representative export through import, box selection and calculation;
retain existing import corrections and avoid adding a new parser unless that example
demonstrates a compatibility issue. If a real export is unavailable, label the fixture
as representative text rather than claiming Cloud compatibility was verified.

Local source inspection found no ready-to-reuse Unbound save reader: A and C's standard
readers handle Pt/HGSS/BW layouts; A's additional pokeemerald reader loads title-specific
constants, with only `inclement.js` and `scrambled.js` present. B supplies text import;
C's import placeholder explicitly directs users to Unbound Cloud. This is a source
inspection finding, not a test against an actual Unbound save. Do not expose another
title's reader as Unbound-compatible. Direct Unbound save import is future work.

### Small adapter, existing loader

Wrap C's data in a title namespace so its `pokedex` declaration cannot overwrite A's
global. Retain the donor data and its tier collections as source data; supply a fresh
working payload to A's `loadDataSource()`:

| Adapter output | Donor input |
|---|---|
| `formatted_sets` | Selected `difficult`, `expert`, or `insane` collection |
| `poks` | `pokedex` |
| `moves` | `unbound_moves` |
| `title` | Stable Unbound title identity used by A |

Use the existing source-selection and bundled-backup conventions. A small title adapter
and narrowly scoped loader corrections are sufficient; do not migrate every title to a
new registry or data-access architecture.

A's loader currently mutates shared UI and engine tables. For the Unbound path, provide
independent working tables for both consumers before applying overrides, keeping the
stock objects intact. Nested stats, types, flags and sets must not alias the source data.
Prefer using the existing table interfaces and page navigation over adding live title
switching. Confirm that the engine's lookup collections actually use the working tables;
copying only the UI's `pokedex` variable is insufficient.

### Resolve known data seams

- Unknown species/forms: compare donor spelling and A's IDs first. Use a small explicit
  alias/correction map where justified. For genuinely unsupported forms, follow the
  owner-selected policy from section 9. Never silently show a selectable trainer set
  whose calculation uses a different species or incomplete stats.
- Owner-approved coverage target: comparable to the existing calculators, with a few
  clearly disclosed omissions acceptable initially. Prioritize difficult battles. Do not
  use this allowance to silently remove a substantial part of the donor collection;
  identify affected trainers/forms and whether any important boss battle is incomplete.
- The original investigation reported 39 missing species IDs and malformed species keys
  `Supply and Demand`, `Rogue Electivire`, and `[2nd`. Check them against actual trainer
  references. Correct only with evidence; otherwise quarantine with a concise diagnostic.
- Keep trainer-name whitespace and ordering conventions. `TR_NAMES` counts trainer-set
  entries, not unique trainers. Avoid inventing a new trainer identity model.
- Inspect negative `level`/`sublevel` values and donor handling before assigning meaning
  to the `Lvl` prefix. A currently special-cases only levels 0 and -1 and mutates the set
  while resolving them. Preserve source values and compute the effective level separately.
- Apply relevant species fields consistently to UI and engine, including `weightkg` and
  `nfe`. Check ability representation compatibility rather than assigning blindly.
- Preserve supplied move flags, allow explicit `false`/`0` overrides, and use the selected
  generation for new entries. Correct these paths where exercised by this integration;
  do not audit every historical title's move semantics.

### Difficulty behavior

Owner preference: Expert is the current playthrough's tier, and changes during that
playthrough are not expected; retain all three selectable tiers. Default to Expert.
Proposed mechanism: use `?m=difficult|expert|insane`; absent or invalid values resolve to
Expert. Change tier by updating the URL and reloading. This matches the existing
navigation style and makes links reproducible. Add persistence only if requested;
URL selection then takes precedence. The owner has specified the desired functionality,
not explicitly selected the URL/reload mechanism; it remains the implementation default.

Ignore the tier parameter for titles without tiers. Restore a saved trainer selection
only if it exists in the selected collection; otherwise choose a valid default. Preserve
the user's imported box. Owner decision: preserve the current shared-box behavior across
titles for the first build. Do not migrate historical storage keys or introduce separate
per-title boxes as part of this work.
Place a plain tier control beside the title selector; polish its layout later.

Done when: all three tiers load; a representative team per tier has the right members,
levels, moves and order; the known malformed records have explicit outcomes; selected
species/moves agree between UI and engine; and another title still loads correctly after
visiting Unbound. Original raw counts (225/357, 243/383, 267/417 species/sets) are useful
sanity checks, not immutable expected totals after documented corrections or imported sets.

## 5. Milestone C: port the missing Unbound effects

Read donor implementations with their immediate callers, then adapt only the required
behavior. Keep A's current mechanics unless the Unbound port needs a specific change.

| Effect | Starting point | Focused integration check |
|---|---|---|
| Vicious Sandstorm | B's damage, weather, speed, residual and description paths | Changed weather behavior and Sand Rush reach the active helpers |
| Shadowy Veil | B's mechanic and description | An eligible case changes; an ineligible case does not |
| Inverse Battle | Inspect A's existing implementation first; compare B | Representative effectiveness including immunity; reuse correct existing code |
| Big Mo | B's `getFinalSpeed` and weight helper | Weight-derived speed and a speed-dependent result use correct species weight |
| Camomons | B's first-two-moves type resolution and handlers | Types update with moves and restore when disabled |

The original plan overstates A's absence of Inverse Battle: A already has
`isInverseBattle` in `Field` and consumes it in `gen78.js`. Establish what is missing for
Unbound before adding anything. Existing G-Max residual effects also need no new port.

Use C's shape for `isBigMoField`, `isShadowyVeil`, and `isCamomonsBattle`; preserve them in
construction and cloning. Follow A's existing UI/state conventions where those paths
exist. Maintain Side badge/buff fields and side-swapping behavior.

Vicious Sandstorm must be wired through the actual active helpers, not just a similarly
named donor file. Keep effects inactive outside the relevant title configuration.
Camomons type derivation should be a small reusable function applied when constructing a
Pokémon, with the UI reflecting that result. This lets existing programmatic calculations
and later prediction use the same rule. Avoid a new effects framework.

Do not port C's unrelated Nature Power difference automatically. Include it only if a
selected Unbound case establishes a missing behavior needed here.

Done when: each changed effect matches its donor on a discriminating case, disabling
effects preserves the selected A baseline, and UI toggles reach the numeric calculation.
Investigate concrete disagreements under section 6 rather than replacing whole files.

## 6. Verification budget and stopping rule

The object of testing is the integration delta. Do not re-prove the inherited damage
formula, every ability/item, all generations, or every species/move combination.

Start with this small set; a single case may satisfy several rows:

| Area | Sufficient initial evidence |
|---|---|
| Loading | One representative team in each tier; one invalid/missing-tier path |
| Data seams | Actual alias/malformed records and one real level-offset case if present |
| Isolation | Stock-table values remain intact; visit Unbound then one existing title |
| Mechanics | Roughly one positive case per changed effect, plus a discriminating boundary where needed |
| Regression | A few captured A results with effects off and one existing-title smoke check |
| UI | One pass through tier selection, field toggles, team selection and box preservation |

These are coverage prompts, not quotas. Do not multiply tests to meet a number. Combine
on/off cases, use existing checks where useful, and add a regression case for a real bug
when it protects a meaningful behavior. No new tests for cosmetic placement or code
structure. No broad test framework migration.

Compare ported mechanics primarily with B using identical inputs, and prediction with C
if included. When inherited behavior differs between A and a donor, establish whether
the port introduced the discrepancy before expanding work.

Use CFRU source or the ROM when there is a concrete ambiguity, donor disagreement relevant
to changed code, suspicious result, or owner-reported issue. Pin any source revision
consulted. Do not clone/audit CFRU and DPE merely to create an exhaustive hypothesis list.
The owner accepts donor matching now; no routine ROM spot checks are required for the
first build. A full engine verification can be separately scoped later. A concrete
discrepancy may still warrant a targeted ROM check, without expanding into that audit.

For a ROM observation, record its hash, relevant battle inputs/stats, effect state, and
observed HP change or turn order. Record how randomness was sampled if relevant. A single
damage observation supports that observation, not every possible roll. Do not build RNG
instrumentation unless resolving a specific discrepancy requires it. Prefer an available
save/state and a manual observation over an emulator automation project.

Store the small reusable fixture set and short notes distinguishing donor-matched,
ROM-observed, and unresolved behavior. Once checks pass, stop testing unless code changes,
a failure, or a concrete new concern justifies another check. Known wrong results in an
advertised supported feature must be fixed or the affected behavior explicitly excluded;
uninvestigated hypothetical engine defects do not block the merge.

## 7. Prediction and layout

### Switch-in prediction: follow-up release

Owner decision: the first build is useful without prediction. Complete the data, tier,
and field-effect integration first. The work below belongs to a subsequent release.

Reuse C's `get_next_in_cfru()` and the active `get_next_in_pkem()` wrapper with minimal
behavioral changes. Prefer A's existing `js/switch_prediction.js`; preserve required
globals, output shape and dispatch values rather than reorganizing the algorithm.

C's `get_next_in_pkem()` guards missing trainer data and immediately delegates to CFRU;
its subsequent body is unreachable. The wrapper name does not require pokeemerald
research. Preserve the wrapper entry point for compatibility; dead-body cleanup is
optional and must not expand into algorithm changes.

Bring the bait-score display, refresh control and relevant HP/hazard recompute triggers.
Ensure candidate calculations consume the same title data and field effects as the main
calculator. Keep existing prediction modes intact. Check a few fixed team states against
C, including one HP/hazard change that affects scoring. Any intentional divergence due to
correctly integrated effects must be explained. An independent AI correctness audit is
separate work unless a concrete defect blocks this port.

### Layout: after mathematical integration

Owner decision: try the first functional build before addressing design annoyances.
Defer the density pass and other design changes until feedback from that use. Initial
work includes only controls needed to expose the integrated functionality and fixes for
UI defects that prevent its use. The owner has used one donor several times; this is not
an endorsement of its entire data collection or mechanics.

Retain team previews. Prototype density at the owner's actual window width, starting with
the wrapper minimum width and panel sizing. Removing those CSS values alone is not proof
that the page fits; inspect the resulting controls and rails. Prefer compact visible rails
before collapse/overlay alternatives. One visual pass at the target width and one wider
width is sufficient initially; no broad screenshot test matrix.

## 8. Coding handoff and completion

Use reviewable commits for data/tier integration, each meaningful mechanics port, and
prediction/layout if included. Keep unrelated cleanup out of those commits. Report:

- What shipped and which donor paths were reused.
- Actual checks performed and any observations made against the ROM.
- Known excluded records or unresolved behavior affecting use.
- One reproducible launch URL and the small fixture/check command, if automated.

Do not require separate design documents for each helper, a full runtime diagram, a
comprehensive mechanics matrix, or a benchmark suite. Brief notes beside the changes
and a compact final handoff are enough.

### Review of this draft for excessive work

The plan intentionally removes the original full-CFRU survey and full-pipeline ROM gate.
It also reduces the earlier review's proposed architecture/test documentation to one
runtime trace, a small adapter contract, and the focused checks above. Existing inverse
and G-Max behavior are reused. Tier reloads avoid live-state orchestration. No new module
system, general data platform, AI redesign, or emulator harness is prescribed.

The remaining required seam work is tied to inspected code: shared-table mutation,
species/move override omissions, level mutation, and browser helper selection. Those are
integration risks with direct consequences for this feature, not speculative rebuilding.
Investigate each only far enough to implement the affected Unbound path correctly.

## 9. Questions for the owner

Resolved decisions below reflect the owner discussion. Deferred questions do not block
the first build. Coding remains unstarted; this document does not initiate implementation.

1. Resolved: the first build is useful without switch-in prediction. Defer prediction
   to a follow-up release after data, tiers and field effects.
2. Resolved preference: the owner plays Expert and does not expect to change tiers during
   this playthrough, but wants tier selection available. Default to Expert and retain all
   three tiers. URL selection with reload remains the proposed implementation mechanism.
3. Resolved: matching donor calculations is acceptable now. Full engine verification is
   optional future work; preserve fixtures/provenance to support it without doing it now.
4. Deferred: emulator/save availability only needs discussion if a concrete discrepancy
   requires a ROM observation or the owner elects to begin later engine verification.
5. Resolved: a few clearly disclosed omissions are acceptable initially; coverage should
   remain comparable to existing calculators. The owner almost exclusively uses the
   calculator for very difficult battles. Prioritize those in representative checks and
   disclose incomplete boss teams prominently in the handoff.
6. Resolved for planning: the owner has used one donor several times and has design
   annoyances to revisit after trying the first build. No particular mechanics/data bug
   has been identified in this discussion. Design iteration follows hands-on feedback.
7. Implementation default: use Renegade Platinum with an imported box for the existing-title
   smoke check, since it is already represented in A's Cypress configuration. This is a
   practical test choice, not an owner statement about their other playthroughs.
8. Resolved: preserve current shared-box behavior across titles for the first build.
9. Deferred until feedback on the first build: target window width, rail visibility,
   density, and other design preferences.

First-build boundary: Expert by default with all three tiers available, comparable donor
coverage with a few disclosed omissions, integrated field effects, text import and the
current shared box. Accept donor-matched calculations. Prediction, design iteration,
direct Unbound save import and full engine verification remain subsequent work.
Do not interpret deferred questions as permission to broaden scope.
