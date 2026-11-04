<script setup>
/**
 * The whole history, off the front page. It was the longest thing there -
 * five versions of it - and a visitor's first question is what the mod is,
 * not what changed in 3.0.
 */
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">❖</span> {{ $t('Changelog') }} <span class="title-icon">❖</span>
        </h1>
      </div>
    </div>

    <div class="row">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-body p-4">
            <div class="changelog-entry">
              <div class="version">Version 3.5.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Crafting reworked: every recipe carries three fixed properties now, and the vanilla crafts use the mod\'s numbers — Hit Power\'s Frost Nova at level 12, Safety\'s damage reduction in one line, Blood with crushing blow, deadly strike or open wounds. Discovery is the farmer\'s craft: magic find, gold find and a slot perk, from a Perfect Topaz') }}</li>
                <li>{{ $t('Added Hex crafting: a Perfect Skull and a rune on a magic item draw one card from the slot\'s deck — common cards four times as often as the uncommon ones, which hit harder — plus two kill-or-steal mods') }}</li>
                <li>{{ $t('Added three Runewords. Unholy Pact (Cham Fal Mal, helms) charges for what it gives: four fixed penalties against a level 15 Summon Defiler, self repair, a ward card and a gift card. Bravado (Thul Ohm, body armor) is the glass cannon: damage, deadly strike, a skill and cannot be frozen, paid with −10% life and −10 to all resistances. Reservoir (Sur Io Vex, helms) is the caster\'s mana store: Warmth as a skill for every class, 40% of damage taken goes to mana, +2 skills') }}</li>
                <li>{{ $t('Added Hexenhammer, a unique Legendary Mallet, with its exalted twin: the witch-hunter\'s weapon — curse resistance, damage and attack rating against demons, a Fire Wall where the kill happened, and 1487 written all over it. The exalted one calls Fist of the Heavens on striking') }}</li>
                <li>{{ $t('Added Corpse Grinder, unique Crusader Gauntlets, with its exalted twin: Find Item fires on every other kill, the loot line rolls magic find or gold find, and the exalted pair horks lying corpses on striking too') }}</li>
                <li>{{ $t('Reworked the skill affixes: chance-to-cast suffixes get levels that matter at the item level they roll on instead of 3 to 5, charged suffixes scale their level with the item, and the charged suffixes the game ships switched off are on — Battle Orders, Static Field, Decrepify, Energy Shield, the Sorceress armors and the rest. Both are options') }}</li>
                <li>{{ $t('Galaxy forms from Jah Vex Sur instead of two Jahs, and its stars are level 7') }}</li>
                <li>{{ $t('The Mythic bonus draws its two stats one at a time — when both draws landed on the same stat, one of them vanished. The Mythic line sits at the bottom of the tooltip now') }}</li>
                <li>{{ $t('Fixed 72 property values that could not survive a save and came back wrong after a reload — the lightning damage on E Schaefer\'s Hammer, the Cow King\'s Leathers magic find and the Bul-Kathos\' Children and M\'avina\'s Battle Hymn bonuses among them') }}</li>
                <li>{{ $t('Fixed three exalted procs that never fired: E Tarnhelm\'s Cloak of Shadows, E Nightwing\'s Veil\'s Shiver Armor and E Spirit Ward\'s Heart of Wolverine. E Griffon\'s Eye casts Static Field when struck and E Stormrider casts Nova on kill — Thunder Storm cannot be cast by an item at all') }}</li>
                <li>{{ $t('False Spirit has one socket now, its exalted version two') }}</li>
                <li>{{ $t('Carried D2R patch 3.4 (Ladder Season 16) into the mod: the 18 uniques Blizzard changed keep their exalted twins ahead of the new base — Dimoak\'s Hew, Serpent Lord, Griswold\'s Edge, The Salamander, The Tannr Gorerod, The Grim Reaper, Silks of the Victor, The Impaler, Coldkill, The Atlantean, Lava Gout, Earthshaker, Grim\'s Burning Dead, Swordguard, Demonhorn\'s Edge, Veil of Steel, Ethereal Edge and Executioner\'s Justice. Where the patch swaps a line, the exalted one swaps with it: E Griswold\'s Edge and E Executioner\'s Justice cast Amplify Damage now, instead of knocking back and Decrepify') }}</li>
                <li>{{ $t('M Isenhart\'s Armory follows the patched set: the attack rating per level sits on the Lightbrand itself, three pieces add maximum damage per level, Parry brings cold and fire resistance, Case magic resistance, Horns life leech — and the full set runs and recovers at 40%, where cannot be frozen used to sit') }}</li>
                <li>{{ $t('Eternity\'s rework is gone: the patch\'s own Eternity — 300–390% damage, 30% attack speed, maximum damage per level, Revive for every class, in missile weapons too — is the better word') }}</li>
                <li>{{ $t('Fixed E Swordguard\'s defense per level: 10 per level does not fit the stat\'s save bits and read as 2; it sits at 7.87, the cap, where the patch puts the base too') }}</li>
                <li>{{ $t('Fixed four of the five Herald names reading "missing string" since Reign of the Warlock, and 23 of the game\'s own lines with them — the Chronicle\'s Rewards title and Learn More among them: the mod\'s item names sat on ids Blizzard later used; they moved to a range of their own') }}</li>
                <li>{{ $t('The in-game cube menus show item sprites and read as [from] → [to]; the crafting menu has a Hex tab and the Runeword menu lists the three new words') }}</li>
                <li>{{ $t('Website: the Terror Zones page reads the offline schedule against the clock — what is terrorized now, what comes next, when a zone or an item is due, and what can drop there with the desecrated-only options on') }}</li>
                <li>{{ $t('Website: the Grail — drop your shared stash and characters on the page and the checklist ticks itself off from the save files, parsed in the browser and never uploaded; the Chronicle adds what was found and since gone. Milestones, a timeline, how rare each find was, a rune cabinet and a picture to share') }}</li>
                <li>{{ $t('Website: the Grail speaks on the Runewords page — built words marked on the row edge, your runes counted, held bases with their staffmods, a runes-needed dropdown on every tier and the bill for every word still unbuilt') }}</li>
                <li>{{ $t('Website: every cube recipe the game and the mod know, on shelves, with the game\'s own icons on runes, gems and ingredients') }}</li>
                <li>{{ $t('Website: search everything from anywhere — items, sets, runewords, runes, recipes, zones, monsters and the pages themselves — with Ctrl+K') }}</li>
                <li>{{ $t('Website: the crafting page has the Hex tab, and the drop calculator can show only what your Grail is still missing from a source, with a switch for counting the exalted and mythic variants') }}</li>
                <li>{{ $t('Website: the drop calculator remembers your difficulty, player count and magic find, and the Grail\'s rarity card scores at the magic find you enter') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.4.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Added 30 new Runewords. A pass over all 118 active words showed where the holes were, by slot and by level: the mod\'s class-specific words started at mid level and the Warlock had none at all, and outside the Paladin\'s world the endgame shield was a choice between Stormshield and Phoenix. Among the new ones are the shield trio Mercy, Anathema and Motley, and Alea, a gambling word that only forms in a Cryptic Sword') }}</li>
                <li>{{ $t('Added 25 new unique items, each with an exalted version. Every one sits on a base that had no unique at all — the bases where the game\'s unique roll simply fails and hands you a rare instead. 14 close the elite gaps in the three highest treasure classes, 9 are class items for the levels where their class is documented to struggle, and 2 are jokes with a working statline') }}</li>
                <li>{{ $t('Reviewed every exalted unique and changed 34 of them — the number inflation on normal-tier weapons comes down, the maximum-resistance budget is enforced, and a dozen items got the mechanic their name always promised') }}</li>
                <li>{{ $t('Added an option for the ultra rare Mythic tier, the 1-in-1000 stat that grants a skill or an aura. On by default; turn it off to cap Mythic stats at the rare tier') }}</li>
                <li>{{ $t('Duriel drops like an act boss now: the town portal spam is gone and his gold and junk are cut to what Andariel and Mephisto drop, so what falls is mostly equipment — about 3.1 pieces a kill instead of 1.9') }}</li>
                <li>{{ $t('Reworked ten of the mod\'s existing Runewords, Galaxy among them: it draws two different stars from one slot now, instead of granting the same two skills every time') }}</li>
                <li>{{ $t('The in-game Runeword menu lists every Runeword the mod adds, and the High tier no longer stops before the Zod words') }}</li>
                <li>{{ $t('Fixed six exalted uniques rolling the wrong property: an internal row was added twice and shifted everything after it, so E Arachnid Mesh, E Death\'s Web, E Mang Song\'s Lesson, E Ribcracker and E Woestave granted a random class skill where they should have been ethereal and indestructible, and E Chromatic Ire was ethereal and indestructible instead of piercing elemental resistance') }}</li>
                <li>{{ $t('Fixed the exalted Bul-Kathos\' Wedding Band showing its raw table name instead of its own') }}</li>
                <li>{{ $t('The chronicle option now covers every unique this mod adds, not only the exalted ones — the chronicle identifies an item by its place in the table, so the new uniques carry the same risk') }}</li>
                <li>{{ $t('Website: filter Runewords by the item you are holding and by its socket count — pick a base or a whole kind, at every level of the family tree') }}</li>
                <li>{{ $t('Website: the Runeword list is one row per word, cut into rune tiers, with a rune picker that says how many words your runes can make and which ones you are a single rune short of') }}</li>
                <li>{{ $t('Website: every filter lives in the address bar, so a search is a link you can send') }}</li>
                <li>{{ $t('Website: the drop calculator marks the items this mod adds or changes') }}</li>
                <li>{{ $t('Website: ethereal items say so, and the front page reads its numbers out of the data instead of a hand-written list') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.3.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Updated for Diablo II: Resurrected patch 3.3') }}</li>
                <li>{{ $t('Adjusted the exalted versions of the nine uniques patch 3.3 reworked — Bane Ash, Blinkbats Form, Bloodletter, Gravenspine, Manald Heal, Piercerib, Pluckeye, The Ward and The Battlebranch') }}</li>
                <li>{{ $t('Adjusted the mythic Angelic set items and the Angelical Raiment set bonus for the same reason') }}</li>
                <li>{{ $t('Removed the ladder-season restriction patch 3.3 put on those items, so they drop for everyone including offline play') }}</li>
                <li>{{ $t('Fixed the exalted Gheed\'s Fortune dropping about 14 times more rarely than the intended 5% — patch 3.3 changed how often the ordinary one drops') }}</li>
                <li>{{ $t('The standalone archive now unpacks straight into mods; it carries the RelicsOfSanctuary folder itself. Delete the old folder rather than merging into it') }}</li>
                <li>{{ $t('Website: the crafted Sunder Charms and the unique jewels are listed now — they are obtained rather than dropped and were missing entirely') }}</li>
                <li>{{ $t('Website: properties that roll one of several options show that list, with each option\'s chance') }}</li>
                <li>{{ $t('Website: the drop calculator follows patch 3.3 — a Worldstone Shard no longer replaces the drop it comes with, and Herald tiers 3-4 and 5+ no longer both count at once') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.2.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Updated for Diablo II: Resurrected patch 3.2') }}</li>
                <li>{{ $t('Added option to rework the vanilla Runewords — 69 Runewords rebalanced (on by default)') }}</li>
                <li>{{ $t('Added option to rework the magic affixes for Large and Grand Charms — 171 affixes rebalanced (on by default)') }}</li>
                <li>{{ $t('Sunder Charms drop with Blizzard\'s original weighting again; the equal drop rate is now optional and off by default') }}</li>
                <li>{{ $t('Removed the option for the minimum Herald tier for Sunder Charms — patch 3.2 handles Herald tiers itself') }}</li>
                <li>{{ $t('Fixed Mythic Infernal Cranium dropping at 85.7% instead of the intended 5%') }}</li>
                <li>{{ $t('Fixed mana steal doing nothing on the Ferocity and Juggernaut Runewords') }}</li>
                <li>{{ $t('Fixed the cube recipes for helmets not adding a Mythic Affix at all') }}</li>
                <li>{{ $t('Fixed the Mythic property being lost when a crafting recipe had no free slot for it') }}</li>
                <li>{{ $t('Fixed crafted items rolling ethereal twice in some cases') }}</li>
                <li>{{ $t('Improved compatibility with other mods (reworked features and localization ids no longer clash)') }}</li>
                <li>{{ $t('D2RMM installation no longer leaves cached payload files in the game folder') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.0.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Added Mythic set items') }}</li>
                <li>{{ $t('Added Mythic crafting chance') }}</li>
                <li>{{ $t('Added recipes to add a Mythic Affix to rare or magic items') }}</li>
                <li>{{ $t('Added 7 more Runewords (15 total)') }}</li>
                <li>{{ $t('Added a cube recipe for socketing similar to Larzuk\'s quest reward') }}</li>
                <li>{{ $t('Added in-game menus with information about cube recipes, crafting recipes, and Runewords') }}</li>
                <li>{{ $t('Added D2RMM options for Exalted/Mythic drop chances and Mythic craft result chance (1/2/5/10%)') }}</li>
                <li>{{ $t('Added D2RMM option to restrict Exalted and Mythic drops to Terror Zones only') }}</li>
                <li>{{ $t('Added D2RMM option for the minimum Herald tier required to drop Sunder Charms') }}</li>
                <li>{{ $t('Added option to enable "Warlord\'s Glory" set drops (official Asia promo set)') }}</li>
                <li>{{ $t('Added option to enable perfect gem drops with adjusted lower-gem frequency for cubing balance') }}</li>
                <li>{{ $t('Added option to enable teleport while in Wolf/Bear form') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 2.0.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Released for compatibility with the new "Reign of the Warlock" DLC') }}</li>
                <li>{{ $t('No additional gameplay features in this release') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.1.0</div>
              <ul class="changelog-list">
                <li>{{ $t('All features are now optional and work in any combination (can be toggled in D2RMM)') }}</li>
                <li>{{ $t('Removed light pillars feature') }}</li>
                <li>{{ $t('Added 8 new Runewords (mid-tier for each class-specific item)') }}</li>
                <li>{{ $t('Crafting: Allow all weapons, helmets, boots, shields, belts, gloves, armors instead of specific ones') }}</li>
                <li>{{ $t('Crafting: 5% chance the result will be ethereal (same chance as dropped items)') }}</li>
                <li>{{ $t('Crafting: Add Recipes for Diamonds and Topaz') }}</li>
                <li>{{ $t('Cube: Rune upgrades without gems (higher runes require a simple key)') }}</li>
                <li>{{ $t('Duriel: Remove TP-drop mechanic, so he drops like other bosses') }}</li>
                <li>{{ $t('Wolf/Bear: Allow using Teleport') }}</li>
                <li>{{ $t('Andariel/Questdrops: Restored normal drop table with 20% chance for quest drop for any boss') }}</li>
                <li>{{ $t('Sunder charms have an equal drop chance') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.3</div>
              <ul class="changelog-list">
                <li>{{ $t('Set nolimit = 1 for original items while using D2RMM (as intended)') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.2</div>
              <ul class="changelog-list">
                <li>{{ $t('Replaced wrong file version for D2RMM') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.1</div>
              <ul class="changelog-list">
                <li>{{ $t('Added support for D2RMM') }}</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.0</div>
              <ul class="changelog-list">
                <li>{{ $t('Initial Release') }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-entry {
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(59, 42, 31, 0.6);
}

.changelog-entry:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.version {
  font-weight: 600;
  color: var(--d2r-gold);
  margin-bottom: 0.5rem;
}

.changelog-list {
  margin-bottom: 0;
  padding-left: 1.5rem;
  list-style-type: none;
}

.changelog-list li {
  margin-bottom: 0.5rem;
  position: relative;
}

.changelog-list li::before {
  content: '\2022';
  color: var(--d2r-gold);
  font-weight: bold;
  position: absolute;
  left: -1rem;
}
</style>
