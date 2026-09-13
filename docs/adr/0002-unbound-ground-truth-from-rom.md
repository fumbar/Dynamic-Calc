# Unbound ground truth comes from the ROM, with CFRU source narrowing the search

Both reference calculators compute Unbound with gen 8 mechanics, but Unbound runs on CFRU —
a Gen 3 engine with later mechanics selectively backported — so wherever CFRU deviates from
gen 8 both references are wrong in the same direction, and comparing them against each other
can never reveal it. Unbound may also deviate from stock CFRU by an unknown amount, so CFRU
source alone is not sufficient either.

We therefore read CFRU source to enumerate where it deviates from gen 8, and use those
deviations as a targeted hypothesis list to test empirically against the Unbound ROM in an
emulator. The ROM is the arbiter; CFRU source only decides what is worth testing. We pin to
**Unbound 2.1.1.1**, the version of the ROM on hand — golden numbers are meaningless without
a stated version, and the two reference datasets may be stale against newer releases.

Considered and rejected: pure empirical testing (only finds bugs you thought to look for) and
full ROM disassembly (skilled, slow work that likely confirms the formula already matches).
pokeemerald-expansion is explicitly out of scope until titles based on it are supported.
