# Feature Ideas

Running list of ideas for Dynamic Calc. Newest ideas go at the bottom.

Status checked 2026-09-13: these remain future work. See [the handoff](docs/HANDOFF.md)
for implemented behavior. Loopback title selection now keeps locally mapped bundled
titles in this fork; that is separate from arbitrary local JSON loading or ROM extraction.

## Local ROM hack data fetching / creating

Today a calc's data comes from a remote npoint.io bin (`?data=<npoint_id>`), with a
handful of titles pre-baked into `backups/*.js`. That means an internet round trip for
any hack that isn't bundled, and no supported way to author or iterate on data locally.

Worth exploring:

- **Local fetching** — allow `?data=` to point at a local file (e.g. `./data/my-hack.json`)
  or a local directory of hack data, so a calc can run fully offline.
- **Caching** — persist a fetched npoint payload (localStorage / IndexedDB / an on-disk
  cache) so repeat loads don't re-fetch, with an explicit refresh.
- **Local creating** — an in-app editor or a CLI in `tools/` to author and validate a
  hack's JSON (pokemon, trainers, encounters, learnsets) without a round trip through
  npoint.io, plus an export that produces a drop-in `backups/*.js` file.
- **Validation** — schema-check hack data and report unknown species/move/item names
  (Showdown spellings) before load rather than failing silently at runtime.

## ROM data extraction plugin

Pull calc data straight out of a ROM instead of hand-maintaining a JSON bin. Today every
title's data is authored elsewhere (npoint, Pokeweb, pk3ds) and lands here as
`formatted_sets` + `pokedex` + moves; the calc has no way to read a ROM itself.

A plugin would take a ROM file and emit the same shape `loadDataSource()` already accepts —
species base stats, types, abilities, learnsets, trainer parties (with the
`Lvl LEVEL TRAINER_NAME` set-name convention), and move data — so extraction becomes a
first-class input rather than an external pipeline.

Note: deliberately out of scope for the initial Unbound merge. Recorded here so the data
layer isn't designed in a way that makes it harder later.

## Direct Unbound save import

Long-term owner goal: read an Unbound `.sav` directly into the calculator's party/box,
removing the need to export text through Unbound Cloud. Text import is acceptable for
the first Unbound build. Inspection of the three local calculator builds found no
ready-to-reuse Unbound save reader; existing readers for other titles do not establish
Unbound compatibility.

Treat this as save parsing, separate from ROM data extraction above. Scope it later
against the owner's Unbound version and representative saves, reusing existing import
and box handling where possible. Save editing/writing is not part of this request.
