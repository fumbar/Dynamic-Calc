# Feature Ideas

Running list of ideas for Dynamic Calc. Newest ideas go at the bottom.

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
