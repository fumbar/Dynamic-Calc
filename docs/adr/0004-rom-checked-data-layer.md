# The data layer is checked against the ROM, and so is one damage constant

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

## Where its authority stops, and where it did not

Base stats, types, move power, move type and move split are data, sitting in tables that
can be read. Damage-formula constants are compiled Thumb code and are a different kind of
work — but not an impossible one, and one of them was settled here.

The live question was the `-ate` boost. Aerilate, Pixilate, Refrigerate and Galvanize apply
1.3x in both donors and 1.2x in this fork's inherited code. CFRU has exactly this as a
compile-time switch, `OLD_ATE_BOOST`, shipped commented out, so CFRU source could say what
an unmodified build does but not what Unbound compiled.

Disassembling settled it. The ability power switch at `0x09cd4e6` funnels every boosting
case into one shared `(power * r3) / 10` tail, and the branch taken when the move is
retyped sets `r3` to 13. **Unbound compiles with `OLD_ATE_BOOST`: the boost is 1.3x.** The
same switch gives Technician and Mega Launcher 15 and Iron Fist 12, which are the values
CFRU documents — three independent corroborations that the function and the register were
read correctly. `check/rom-ate.md` records the full trail.

This branch got that question wrong twice before getting it right: first changing to 1.3x
because both donors said so, then reverting to 1.2x because CFRU ships the switch off and
donor agreement is not evidence. The reasoning behind the revert was sound and the
conclusion was wrong. Reading the ROM is what separated them, which is the whole point of
ADR 0002.

What remains unread is the rest of the damage code. Nothing here licenses assuming the
formula matches elsewhere; it licenses disassembling the next constant when one is
disputed, which is now a known and repeatable procedure rather than a hypothetical.
