// Adapter between the Unbound donor data in backups/unbound.js and this
// application's loadDataSource().
//
// It does three things: pick the difficulty tier, hand loadDataSource a fresh
// working payload that shares no object with the donor, and apply the small set of
// donor-record corrections that actual trainer references justify.

var UNBOUND_TITLE = "Unbound 2.1.1";
var UNBOUND_TIERS = ["difficult", "expert", "insane"];
var UNBOUND_DEFAULT_TIER = "expert";

// Filled in by buildUnboundDataSource; surfaced in the console and used by the
// handoff notes so excluded records are never silently dropped.
var UNBOUND_NOTES = [];

// Move names in the donor sets that no move table resolves. Each is a spelling or
// casing variant of a move both tables do have; checked against the referencing set.
var UNBOUND_MOVE_ALIASES = {
    "ThunderPunch": "Thunder Punch",
    "Heatt Wave": "Heat Wave",
    "Freeze Dry": "Freeze-Dry",
    "DIscharge": "Discharge",
    // The donor's own question mark. Kept as Fire because that is what it says;
    // recorded as a disclosed assumption rather than a correction.
    "Hidden Power (Fire?)": "Hidden Power Fire"
};

// Base powers read out of the ROM that both donors get wrong. The ROM is the
// arbiter (ADR 0002): Unbound keeps the pre-generation-6 values for these, the way
// it does for Surf, Thunderbolt, Flamethrower and Ice Beam at 95, which the donors
// do have right. Verified against ROM md5 9cad8e771940e7f7094d13911552cef0, move
// table 0xa769af, indices 56 and 359. See check/rom-data.js.
var UNBOUND_ROM_BASE_POWER = {
    "Hydro Pump": 120,
    "Aura Sphere": 90
};

// Natures the donor states as something that is not a nature. Both donors carry
// "72" on Miltank / Leader Mel in the Difficult tier; the intended nature is not
// recoverable, so the set falls back to a neutral one and says so. Left as-is the
// nature does not resolve and the calculation throws.
var UNBOUND_NEUTRAL_NATURE = "Serious";

// Mega Stones the donor names with a truncated spelling. Both donors carry the
// typo, and the stock item table has the real names, so these are corrected rather
// than quarantined: left alone the item does not resolve, which both loses the
// stone and crashes the Knock Off path in calc/mechanics/gen78.js.
var UNBOUND_ITEM_ALIASES = {
    "Houndoomite": "Houndoominite",
    "Kangaskhite": "Kangaskhanite",
    "Weakmess Policy": "Weakness Policy",
    "Flynium Z": "Flyinium Z",
    "Necrozium Z": "Ultranecrozium Z"
};

// Unresolved move names. Blanked to the donor's own empty-slot convention rather
// than guessed at, so the set stays usable and the gap is visible.
//   Bad Tantrum: Pupitar, "Lvl 47 Rival 4 |Player Chose Gible|", all tiers.
var UNBOUND_UNRESOLVED_MOVES = ["Bad Tantrum"];

// Species keys that are not species. The donor's trainer column uses a pipe-delimited
// label -- "Science Society Scientist |Supply and Demand|" -- and in these records the
// label landed in the species position instead. The real species is not recoverable
// from the data, so the sets are dropped rather than calculated against a guess.
var UNBOUND_QUARANTINED_SPECIES = ["Supply and Demand", "Rogue Electivire", "[2nd"];

function deepCopy(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

// Resolves ?m=. Anything absent or unrecognised falls back to the default tier.
function unboundTier(search) {
    var q = new URLSearchParams(typeof search === "string" ? search : window.location.search);
    var requested = (q.get("m") || "").toLowerCase();
    if (UNBOUND_TIERS.indexOf(requested) !== -1) return requested;
    return UNBOUND_DEFAULT_TIER;
}

function applyUnboundSetCorrections(sets) {
    var dropped = [];
    var aliased = {};
    var blanked = {};

    for (var i = 0; i < UNBOUND_QUARANTINED_SPECIES.length; i++) {
        var bad = UNBOUND_QUARANTINED_SPECIES[i];
        if (sets[bad]) {
            dropped.push(bad + ": " + Object.keys(sets[bad]).join(", "));
            delete sets[bad];
        }
    }

    var itemsFixed = {};
    var naturesFixed = {};
    for (var species in sets) {
        for (var setName in sets[species]) {
            var set = sets[species][setName];
            if (set.item && UNBOUND_ITEM_ALIASES[set.item]) {
                itemsFixed[set.item] = UNBOUND_ITEM_ALIASES[set.item];
                set.item = UNBOUND_ITEM_ALIASES[set.item];
            }
            if (set.nature && !/^[A-Za-z]+$/.test(set.nature)) {
                naturesFixed[set.nature] = species + " / " + setName;
                set.nature = UNBOUND_NEUTRAL_NATURE;
            }
            var moveList = sets[species][setName].moves;
            if (!moveList) continue;
            for (var m = 0; m < moveList.length; m++) {
                var move = moveList[m];
                if (UNBOUND_MOVE_ALIASES[move]) {
                    aliased[move] = UNBOUND_MOVE_ALIASES[move];
                    moveList[m] = UNBOUND_MOVE_ALIASES[move];
                } else if (UNBOUND_UNRESOLVED_MOVES.indexOf(move) !== -1) {
                    blanked[move] = species + " / " + setName;
                    moveList[m] = "";
                }
            }
        }
    }

    for (var d = 0; d < dropped.length; d++) {
        UNBOUND_NOTES.push("excluded set, species field is a trainer label -- " + dropped[d]);
    }
    for (var from in aliased) {
        UNBOUND_NOTES.push("move name corrected: '" + from + "' -> '" + aliased[from] + "'");
    }
    for (var unresolved in blanked) {
        UNBOUND_NOTES.push("move left blank, no match found: '" + unresolved + "' on " + blanked[unresolved]);
    }
    for (var badNature in naturesFixed) {
        UNBOUND_NOTES.push("nature '" + badNature + "' is not a nature, using " +
            UNBOUND_NEUTRAL_NATURE + " on " + naturesFixed[badNature]);
    }
    for (var badItem in itemsFixed) {
        UNBOUND_NOTES.push("item name corrected: '" + badItem + "' -> '" + itemsFixed[badItem] + "'");
    }
    return sets;
}

// The donor states base power as `bp`; loadDataSource reads `basePower`. Without
// this every Unbound move would silently keep its stock base power -- Surf would
// calculate at 90 instead of Unbound's 95. Filled in rather than renamed, because
// the rest of the application reads `bp` off the move table afterwards.
function normaliseMoveBasePower(moveTable) {
    var corrected = [];
    for (var romName in UNBOUND_ROM_BASE_POWER) {
        var entry = moveTable[romName];
        if (entry && entry.bp !== UNBOUND_ROM_BASE_POWER[romName]) {
            corrected.push(romName + " " + entry.bp + " -> " + UNBOUND_ROM_BASE_POWER[romName]);
            entry.bp = UNBOUND_ROM_BASE_POWER[romName];
        }
    }
    if (corrected.length) {
        UNBOUND_NOTES.push("base power corrected from the ROM: " + corrected.join(", "));
    }

    var filled = 0;
    for (var name in moveTable) {
        var move = moveTable[name];
        if (typeof move.basePower === "undefined" && typeof move.bp !== "undefined") {
            move.basePower = move.bp;
            filled++;
        }
    }
    if (filled) UNBOUND_NOTES.push("base power read from 'bp' for " + filled + " moves");
    return moveTable;
}

// Builds the payload loadDataSource() consumes. Every object in it is a fresh copy,
// so the loader's in-place overrides cannot reach back into the donor tables.
function buildUnboundDataSource(donor, tier) {
    UNBOUND_NOTES = [];
    tier = tier || unboundTier();

    var collection = donor.formatted_sets[tier];
    if (!collection) {
        UNBOUND_NOTES.push("tier '" + tier + "' not in donor data, using " + UNBOUND_DEFAULT_TIER);
        tier = UNBOUND_DEFAULT_TIER;
        collection = donor.formatted_sets[tier];
    }

    // Ability names the stock list does not carry. Without these the UI's ability
    // selector cannot hold the set's ability, and the calculation silently runs with
    // whatever the selector fell back to. Collected from the data rather than listed
    // by hand, so a donor update cannot leave one behind.
    var extraAbilities = [];
    (function () {
        var known = {};
        var stock = typeof abilities !== "undefined" && abilities ? abilities : [];
        for (var i = 0; i < stock.length; i++) known[stock[i]] = true;
        var seen = {};
        for (var species in collection) {
            for (var setName in collection[species]) {
                var ability = collection[species][setName].ability;
                if (ability && !known[ability] && !seen[ability]) {
                    seen[ability] = true;
                    extraAbilities.push(ability);
                }
            }
        }
        if (extraAbilities.length) {
            UNBOUND_NOTES.push("abilities added to the selector: " + extraAbilities.join(", "));
        }
    })();

    var payload = {
        formatted_sets: applyUnboundSetCorrections(deepCopy(collection)),
        poks: deepCopy(donor.pokedex),
        moves: normaliseMoveBasePower(deepCopy(donor.unbound_moves)),
        title: UNBOUND_TITLE,
        // Tells loadDataSource to override copies of the shared tables rather than
        // the stock objects themselves. See isolateWorkingTables().
        isolate_tables: true,
        // The block of field controls this title exposes.
        field_effects: "unbound-effects",
        // Unbound carries species the stock dex has no entry for -- Shadow-Warrior
        // is used by a trainer set -- so they must be created, not left to a URL flag.
        custom_poks: true,
        // Translate the donor's move flags to the names the engine reads: without
        // this, Iron Fist misses Wicked Blow and a custom move has no flags at all.
        apply_move_flags: true,
        // 1.3x for the -ate abilities, read out of the ROM: see check/rom-ate.md.
        ate_bp_mod: 5325,
        extra_abilities: extraAbilities
    };
    payload.tier = tier;

    if (UNBOUND_NOTES.length) {
        console.log("Unbound data notes (" + tier + "):\n  " + UNBOUND_NOTES.join("\n  "));
    }
    return payload;
}

// Replaces the four tables loadDataSource() mutates with independent copies, so the
// stock dex and stock move data survive a title load intact. Both consumers are
// covered: the UI reads `pokedex` and `moves`, the engine reads SPECIES_BY_ID[gen]
// and MOVES_BY_ID[gen] -- reassigning those array slots is what the engine's
// Species.get() and Moves.get() look at on every call.
function isolateWorkingTables() {
    if (typeof pokedex !== "undefined" && pokedex) pokedex = deepCopy(pokedex);
    if (typeof moves !== "undefined" && moves) moves = deepCopy(moves);
    if (typeof SPECIES_BY_ID !== "undefined" && SPECIES_BY_ID[gen]) {
        SPECIES_BY_ID[gen] = deepCopy(SPECIES_BY_ID[gen]);
    }
    if (typeof MOVES_BY_ID !== "undefined" && MOVES_BY_ID[g]) {
        MOVES_BY_ID[g] = deepCopy(MOVES_BY_ID[g]);
    }
    // The ability list is appended to for titles with their own abilities, so the
    // stock array needs the same treatment.
    if (typeof abilities !== "undefined" && abilities) {
        abilities = abilities.slice();
        calc.ABILITIES[gen] = abilities;
    }
}

// Shows the tier selector and makes it navigate. Changing tier rewrites ?m= and
// reloads, which keeps a chosen tier in the link and matches how this application
// already switches titles. Any saved trainer selection that the new tier does not
// contain is cleared, so the page does not restore a set that is no longer there.
function initTierControl(tier) {
    var select = $('#tier-select');
    if (!select.length) return;
    select.val(tier).removeClass('gone');
    select.off('change.tier').on('change.tier', function () {
        var chosen = $(this).val();
        if (chosen === tier) return;
        if (!setExistsInTier(chosen, localStorage["right"])) {
            delete localStorage["right"];
            delete localStorage["left"];
        }
        var q = new URLSearchParams(window.location.search);
        q.set('m', chosen);
        window.location.search = q.toString();
    });
}

// True when the remembered trainer set name is also present in the target tier.
function setExistsInTier(tier, setName) {
    if (!setName) return false;
    var collection = UNBOUND_DONOR && UNBOUND_DONOR.formatted_sets[tier];
    if (!collection) return false;
    for (var species in collection) {
        if (collection[species][setName]) return true;
    }
    return false;
}

// Reveals the title's own field controls and keeps the Camomons type display in
// step with the rule the engine applies. Donor B does Camomons in the UI only; here
// the engine derives the types (calc/mechanics/util.js, checkCamomons) and this
// mirrors that into the visible type selects so the page shows what it calculated.
function initFieldEffects(selector) {
    $('.' + selector).removeClass('gone');
    // Delegated, so it survives init_calc() reloading shared_controls.js. Only a
    // user toggle redraws the types: running it during the load would fire set
    // selection handlers before the title's data is in place.
    $(document).off('change.camomons').on('change.camomons', '#camomons', function () {
        showCamomonsTypes($(this).prop('checked'));
    });
}

function showCamomonsTypes(on) {
    ['#p1', '#p2'].forEach(function (id) {
        var poke = $(id);
        if (!on) {
            // Put the species' own types back by re-running the set selection.
            poke.find('.set-selector').change();
            return;
        }
        var first = poke.find('.move1 .move-type').val();
        var second = poke.find('.move2 .move-type').val();
        poke.find('.type1').val(first).change();
        poke.find('.type2').val(second === first ? '' : second).change();
    });
}
