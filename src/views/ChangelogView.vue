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
          <span class="title-icon">❖</span> Changelog <span class="title-icon">❖</span>
        </h1>
      </div>
    </div>

    <div class="row">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-body p-4">
            <div class="changelog-entry">
              <div class="version">Version 3.4.0</div>
              <ul class="changelog-list">
                <li>Added 30 new Runewords. A pass over all 118 active words showed where the holes were, by slot and by level: the mod's class-specific words started at mid level and the Warlock had none at all, and outside the Paladin's world the endgame shield was a choice between Stormshield and Phoenix. Among the new ones are the shield trio Mercy, Anathema and Motley, and Alea, a gambling word that only forms in a Cryptic Sword</li>
                <li>Added 25 new unique items, each with an exalted version. Every one sits on a base that had no unique at all — the bases where the game's unique roll simply fails and hands you a rare instead. 14 close the elite gaps in the three highest treasure classes, 9 are class items for the levels where their class is documented to struggle, and 2 are jokes with a working statline</li>
                <li>Reviewed every exalted unique and changed 34 of them — the number inflation on normal-tier weapons comes down, the maximum-resistance budget is enforced, and a dozen items got the mechanic their name always promised</li>
                <li>Added an option for the ultra rare Mythic tier, the 1-in-1000 stat that grants a skill or an aura. On by default; turn it off to cap Mythic stats at the rare tier</li>
                <li>Duriel drops like an act boss now: the town portal spam is gone and his gold and junk are cut to what Andariel and Mephisto drop, so what falls is mostly equipment — about 3.1 pieces a kill instead of 1.9</li>
                <li>Reworked ten of the mod's existing Runewords, Galaxy among them: it draws two different stars from one slot now, instead of granting the same two skills every time</li>
                <li>The in-game Runeword menu lists every Runeword the mod adds, and the High tier no longer stops before the Zod words</li>
                <li>Fixed six exalted uniques rolling the wrong property: an internal row was added twice and shifted everything after it, so E Arachnid Mesh, E Death's Web, E Mang Song's Lesson, E Ribcracker and E Woestave granted a random class skill where they should have been ethereal and indestructible, and E Chromatic Ire was ethereal and indestructible instead of piercing elemental resistance</li>
                <li>Fixed the exalted Bul-Kathos' Wedding Band showing its raw table name instead of its own</li>
                <li>The chronicle option now covers every unique this mod adds, not only the exalted ones — the chronicle identifies an item by its place in the table, so the new uniques carry the same risk</li>
                <li>Website: filter Runewords by the item you are holding and by its socket count — pick a base or a whole kind, at every level of the family tree</li>
                <li>Website: the Runeword list is one row per word, cut into rune tiers, with a rune picker that says how many words your runes can make and which ones you are a single rune short of</li>
                <li>Website: every filter lives in the address bar, so a search is a link you can send</li>
                <li>Website: the drop calculator marks the items this mod adds or changes</li>
                <li>Website: ethereal items say so, and the front page reads its numbers out of the data instead of a hand-written list</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.3.0</div>
              <ul class="changelog-list">
                <li>Updated for Diablo II: Resurrected patch 3.3</li>
                <li>Adjusted the exalted versions of the nine uniques patch 3.3 reworked — Bane Ash, Blinkbats Form, Bloodletter, Gravenspine, Manald Heal, Piercerib, Pluckeye, The Ward and The Battlebranch</li>
                <li>Adjusted the mythic Angelic set items and the Angelical Raiment set bonus for the same reason</li>
                <li>Removed the ladder-season restriction patch 3.3 put on those items, so they drop for everyone including offline play</li>
                <li>Fixed the exalted Gheed's Fortune dropping about 14 times more rarely than the intended 5% — patch 3.3 changed how often the ordinary one drops</li>
                <li>The standalone archive now unpacks straight into mods; it carries the RelicsOfSanctuary folder itself. Delete the old folder rather than merging into it</li>
                <li>Website: the crafted Sunder Charms and the unique jewels are listed now — they are obtained rather than dropped and were missing entirely</li>
                <li>Website: properties that roll one of several options show that list, with each option's chance</li>
                <li>Website: the drop calculator follows patch 3.3 — a Worldstone Shard no longer replaces the drop it comes with, and Herald tiers 3-4 and 5+ no longer both count at once</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.2.0</div>
              <ul class="changelog-list">
                <li>Updated for Diablo II: Resurrected patch 3.2</li>
                <li>Added option to rework the vanilla Runewords — 69 Runewords rebalanced (on by default)</li>
                <li>Added option to rework the magic affixes for Large and Grand Charms — 171 affixes rebalanced (on by default)</li>
                <li>Sunder Charms drop with Blizzard's original weighting again; the equal drop rate is now optional and off by default</li>
                <li>Removed the option for the minimum Herald tier for Sunder Charms — patch 3.2 handles Herald tiers itself</li>
                <li>Fixed Mythic Infernal Cranium dropping at 85.7% instead of the intended 5%</li>
                <li>Fixed mana steal doing nothing on the Ferocity and Juggernaut Runewords</li>
                <li>Fixed the cube recipes for helmets not adding a Mythic Affix at all</li>
                <li>Fixed the Mythic property being lost when a crafting recipe had no free slot for it</li>
                <li>Fixed crafted items rolling ethereal twice in some cases</li>
                <li>Improved compatibility with other mods (reworked features and localization ids no longer clash)</li>
                <li>D2RMM installation no longer leaves cached payload files in the game folder</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 3.0.0</div>
              <ul class="changelog-list">
                <li>Added Mythic set items</li>
                <li>Added Mythic crafting chance</li>
                <li>Added recipes to add a Mythic Affix to rare or magic items</li>
                <li>Added 7 more Runewords (15 total)</li>
                <li>Added a cube recipe for socketing similar to Larzuk's quest reward</li>
                <li>Added in-game menus with information about cube recipes, crafting recipes, and Runewords</li>
                <li>Added D2RMM options for Exalted/Mythic drop chances and Mythic craft result chance (1/2/5/10%)</li>
                <li>Added D2RMM option to restrict Exalted and Mythic drops to Terror Zones only</li>
                <li>Added D2RMM option for the minimum Herald tier required to drop Sunder Charms</li>
                <li>Added option to enable "Warlord's Glory" set drops (official Asia promo set)</li>
                <li>Added option to enable perfect gem drops with adjusted lower-gem frequency for cubing balance</li>
                <li>Added option to enable teleport while in Wolf/Bear form</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 2.0.0</div>
              <ul class="changelog-list">
                <li>Released for compatibility with the new "Reign of the Warlock" DLC</li>
                <li>No additional gameplay features in this release</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.1.0</div>
              <ul class="changelog-list">
                <li>All features are now optional and work in any combination (can be toggled in D2RMM)</li>
                <li>Removed light pillars feature</li>
                <li>Added 8 new Runewords (mid-tier for each class-specific item)</li>
                <li>Crafting: Allow all weapons, helmets, boots, shields, belts, gloves, armors instead of specific ones</li>
                <li>Crafting: 5% chance the result will be ethereal (same chance as dropped items)</li>
                <li>Crafting: Add Recipes for Diamonds and Topaz</li>
                <li>Cube: Rune upgrades without gems (higher runes require a simple key)</li>
                <li>Duriel: Remove TP-drop mechanic, so he drops like other bosses</li>
                <li>Wolf/Bear: Allow using Teleport</li>
                <li>Andariel/Questdrops: Restored normal drop table with 20% chance for quest drop for any boss</li>
                <li>Sunder charms have an equal drop chance</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.3</div>
              <ul class="changelog-list">
                <li>Set nolimit = 1 for original items while using D2RMM (as intended)</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.2</div>
              <ul class="changelog-list">
                <li>Replaced wrong file version for D2RMM</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.1</div>
              <ul class="changelog-list">
                <li>Added support for D2RMM</li>
              </ul>
            </div>
            <div class="changelog-entry">
              <div class="version">Version 1.0.0</div>
              <ul class="changelog-list">
                <li>Initial Release</li>
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
