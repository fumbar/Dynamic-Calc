# Donor-matched calculations are accepted for the first Unbound build

[ADR 0002](0002-unbound-ground-truth-from-rom.md) stands as the accuracy position: the ROM is
the arbiter, and agreement between calculators proves nothing about the game. This decision
does not overturn that. It sets what the **first build** has to clear before it ships.

The owner accepts matching donor calculations now. Verification against the ROM is optional
future work rather than a release prerequisite, so the merge reuses the donors' implemented
mechanics and checks the integration delta: that the port reproduces the donor on cases chosen
to discriminate the effect, and that turning the effect off leaves this fork's existing results
unchanged. The full CFRU survey and the end-to-end ROM gate in ADR 0002 are deferred, not
abandoned.

What keeps that future work cheap: the comparison cases live in `check/mechanics.js` and run
both engines from source on identical, explicitly stated inputs, so a ROM observation can be
added as a third column against the same cases. Donor provenance is recorded at the top of
`backups/unbound.js` and in the handoff notes, and the donor collections are preserved as
source data rather than edited in place.

A concrete discrepancy — a donor disagreement in changed code, a suspicious result, an owner
report — still justifies a targeted ROM check under ADR 0002's terms. What this decision rules
out is treating that audit as a precondition for a usable calculator.
