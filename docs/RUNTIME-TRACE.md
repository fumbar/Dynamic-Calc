# Runtime trace: which code runs for `gen=8&dmgGen=8`

Milestone A, step 3. Brief trace only — see
[the revised plan](IMPLEMENTATION-PLAN-REVISED.md) §3.

## Module resolution in the browser

`index.html` defines one shared object and a path-ignoring shim:

```js
var calc = exports = {};
function require() { return exports };
```

Every `calc/*.js` file assigns onto that single `exports`. `require("./anything")`
returns it. So **the file that loads last wins for any duplicated export name**, and a
`require` path that points at a file the page never loads silently resolves to whatever
else is already on `exports`.

## The damage path

`calc/calc.js` builds `MECHANICS` from requires that all collapse to `exports`:

- `gen56_1` / `gen78_1` → `exports.calculateBWXY`
- `genRR_1` → `exports.calculateSMSS`

`MECHANICS[8]` is `calculateSMSS`. With `dmgGen=8` neither the `damageGen == 12` nor the
`damageGen == 7` branch in `calculate()` fires, so `gen.num = 8` selects `MECHANICS[8]`.

**Active for the Unbound path:** `calculateSMSS` in
[calc/mechanics/gen78.js](../calc/mechanics/gen78.js).

`exports.calculateBWXY` resolves to [calc/mechanics/gen56.js](../calc/mechanics/gen56.js),
because the page loads `gen78.js` before `gen56.js` and both define that name.

## The helper trap

`gen78.js` line 7 does `var util_2 = require("./custom/util")`. The page never loads
`calc/mechanics/custom/util.js`; the script tag is `./calc/mechanics/util.js`. So
`util_2` is the shared `exports`, and the helpers gen78 calls through it — including the
generation-dependent ones — are **`calc/mechanics/util.js`'s** implementations.

Consequence for this merge: any Unbound mechanic ported into a helper must land in
`calc/mechanics/util.js` (or in `gen78.js` itself) to reach the running calculation.
Editing `calc/mechanics/custom/util.js` changes nothing in the browser.

`calc/mechanics/util.js` also re-declares `damageGen` from the URL:

```js
var params = new URLSearchParams(window.location.search);
var damageGen = parseInt(params.get('dmgGen'));
```

The query string, not the global set in `showdown_hooks.js`, is the effective source.

## Data loading

`js/showdown_hooks.js` maps `?data=<id>` → title via `SOURCES`, then either loads
`./backups/<file>.js` (which assigns `backup_data`) or fetches npoint, and calls
`loadDataSource(data)`. That function mutates the shared tables in place: `pokedex`,
`SPECIES_BY_ID[gen]`, `moves` and `MOVES_BY_ID[g]` — the stock dex the engine reads.

## Fixture harness

[check/harness.js](../check/harness.js) loads the same `calc/*` files in the same order
through the same shim, so fixtures exercise the helpers the browser actually runs, not a
Node resolution of `./custom/util`. Run with `node check/run.js`; `--update` re-records.
