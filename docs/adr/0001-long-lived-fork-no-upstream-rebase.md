# Merge work lives on a long-lived branch; we stop rebasing onto upstream

Current naming (2026-09-13): `unbound-merge` below is the planning name. The owner's
working branch was `dynamic-calc-merge-opus`; it is now an ancestor of `master`, and work
lands on `master`, which pushes to `origin`. No `upstream` remote is configured at present,
so cherry-picking a specific upstream fix means adding one first. The no-rebase decision
remains in force; see [the handoff](../HANDOFF.md) for current checkout state.

The Unbound merge adds several thousand ported lines to a fork that already carries local
patches, which makes whole-tree rebases onto `hzla/Dynamic-Calc` progressively more painful
and eventually not worth doing. We work on a long-lived `unbound-merge` branch in this fork
and keep an `upstream` remote for cherry-picking specific fixes, but we explicitly abandon
rebasing the tree onto upstream.

The alternative — staying rebase-compatible — would have constrained how freely we can
restructure `showdown_hooks.js` and the layout, which is most of the work. Recording this so
a future reader doesn't mistake the divergence for neglect and try to "resync" the fork.
