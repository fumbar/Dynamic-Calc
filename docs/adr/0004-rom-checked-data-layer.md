# The data layer is checked against the ROM; the damage code is not

[ADR 0002](0002-unbound-ground-truth-from-rom.md) makes the ROM the arbiter.
[ADR 0003](0003-donor-matching-accepted-for-first-build.md) accepted donor matching as
the bar for shipping the first build. This records what the ROM actually settled once it
was available, and where its authority stops.

## What was read

`check/rom-data.js` reads three tables straight out of `roms/Pokemon Unbound Official.gba`
(md5 `9cad8e771940e7f7094d13911552cef0`): species names at `0x166a98c`, base stats at
`0x19e0c9c`, move names at `0xa40a10` and move data at `0xa769af`. Every offset was located
by pattern — the encoded text "Bulbasaur", Bulbasaur's stat line with Ivysaur's following
one struct later, Pound's move row — and each is asserted again at run time, so a different
build fails loudly rather than reading noise.

Two tables in this ROM begin with a valid Pound row. The one at `0x900000` is `0xFF` filler
from about move index 690 onward; `0xa769af` carries every expanded move and is the live
one. Reading the wrong one reports false differences on Acid, Sucker Punch, and every move
DPE added — worth knowing, because the first pass did exactly that.

## What it settled

Species base stats and types agree with the loaded data on 99.48%, with no difference at
all on a species any trainer uses. Move power, type and split agree on 99.67% of the moves
trainers use. Two donor errors were corrected against the cartridge: **Hydro Pump is 120,
not 110**, and **Aura Sphere is 90, not 80**. Both donors have these wrong, so the
calculator now deliberately disagrees with both.

It also confirmed the `bp`/`basePower` loader bug was real rather than cosmetic: the ROM
gives Surf, Thunderbolt, Flamethrower and Ice Beam 95, which is what the donor data says and
what the stock tables did not.

CFRU source (pinned at `b637a27`) confirmed the Portal Power port exactly — 0.75x on
non-contact moves, behind a flag CFRU describes as Hoopa-Unbound's ability in Unbound.

## Where its authority stops

Base stats, types, move power, move type and move split are data, sitting in tables that can
be read. **Damage-formula constants are compiled Thumb code and were not read.** Anything in
that category remains unverified no matter how much of the data layer checks out.

The live example is the `-ate` boost. Aerilate, Pixilate, Refrigerate and Galvanize apply
1.3x in both donors and 1.2x here. CFRU has exactly this as a compile-time switch,
`OLD_ATE_BOOST`, and ships it commented out — so 1.2x is what an unmodified build does, and
1.3x requires Unbound to have opted in. Whether it did is not determinable from the tables.

This fork keeps CFRU's default. Agreement between two donors is not evidence that Unbound
changed a compile flag, and an earlier commit here moved to 1.3x on exactly that reasoning,
which this decision reverses. The circumstantial evidence cuts both ways: Unbound clearly
disabled `GEN_6_POWER_NERFS` (Surf is 95, Hydro Pump 120) but kept `GEN_7_POWER_NERFS`
(Sucker Punch is 70) — and the 1.3x-to-1.2x change is a generation 7 change, which is the
only reason to prefer the default rather than a coin flip.

Settling it needs one of: disassembling the ability modifier in the ROM, or a single battle
observation with an `-ate` user against a known target. `check/agreement.js` reports these
cases in their own row so the number never gets quietly absorbed into "agreement".
