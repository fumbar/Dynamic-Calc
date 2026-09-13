# Reading the -ate multiplier out of the ROM

Aerilate, Pixilate, Refrigerate and Galvanize boost a Normal move they retype. Both
donor calculators apply 1.3x; this fork's inherited default is 1.2x. CFRU has exactly
this as a compile-time switch, `OLD_ATE_BOOST`, shipped commented out — so the question
was which way Pokemon Unbound compiled it, and neither the donors nor CFRU's source
could answer that.

Base stats and move data are tables that can be read directly. This is not: it is
compiled Thumb. So it was disassembled, against ROM md5
`9cad8e771940e7f7094d13911552cef0`, using capstone.

## The trail

**Ability ids come from the ROM, not from CFRU's header.** DPE renumbers, so the ids
were taken from the expanded ability name table at `0xa36398`, stride 17 — where index
`0x5C` reads "Sheer Force", `0x5D` "Iron Fist", `0x7F` "Mega Launcher", `0x87`–`0x8A`
"Refrigerate"/"Pixilate"/"Aerilate"/"Normalize" and `0xED` "Galvanize". CFRU's header
happens to agree, but that was checked rather than assumed.

**The power switch is at `0x09cd4e6`.** It dispatches on the attacker's ability with a
chain of comparisons, and every boosting case funnels into one shared tail:

```
0x09cd6fc  movs r0, r3          ; r3 is the multiplier
0x09cd6fe  muls r0, r4, r0      ; r4 is the power, u16
0x09cd700  movs r1, #0xa        ; 10
0x09cd702  b    #0x9cd76c       ; -> bl divide, truncate to u16, store back to r4
```

So every case is `power = (power * r3) / 10`, and reading a case means reading the `r3`
it sets.

**The -ate case.** Ability `0x89` and neighbours call
`AbilityCanChangeTypeAndBoost` (entry `0x09cd468`, identifiable because it returns true
for `0x87`–`0x89` and `0xED`), then:

```
0x09cd830  cmp  r0, #0          ; did the ability retype the move?
0x09cd832  beq  #0x9cd836       ; no  -> no boost
0x09cd834  b    #0x9cd620
0x09cd620  movs r3, #0xd        ; 13
0x09cd622  b    #0x9cd6fc       ; -> (power * 13) / 10
```

**13. Unbound compiles with `OLD_ATE_BOOST`, so the -ate boost is 1.3x.**

## Why this reading is trusted

Three other cases in the same switch were read the same way and match the values CFRU
documents, which would not happen if the function or the register had been misidentified:

| ability | ROM | CFRU source |
|---|---|---|
| Technician (`0x52`, gated on power <= 60) | `movs r3, #0xf` | 1.5x |
| Mega Launcher (`0x7F`, gated on a pulse flag) | `movs r3, #0xf` | 1.5x |
| Iron Fist (`0x5D`, gated on a punch flag) | `movs r3, #0xc` | 1.2x |

## What this corrects

An earlier commit on this branch moved to 1.3x to match the donors, and a later one
reverted it to 1.2x on the grounds that CFRU ships the switch off and donor agreement is
not evidence. That reasoning was sound but the conclusion was wrong: Unbound did enable
it. 1.3x is restored, now on the ROM rather than on the donors agreeing.
