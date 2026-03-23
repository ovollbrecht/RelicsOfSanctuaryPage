<script setup>
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">⚔</span> 
          Relics Of Sanctuary 
          <span class="title-icon">⚔</span>
        </h1>
        <p class="lead">A Diablo 2 Resurrected mod focused on Exalted and Mythic progression, new Runewords, and configurable endgame systems</p>
      </div>
    </div>

    <!-- About Section -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">About This Mod</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              Relics of Sanctuary adds Exalted and Mythic progression to Diablo 2 Resurrected.
              Exalted unique items are improved versions of their original counterparts with stronger stats and additional tweaks.
            </p>
            <p class="card-text">
              With v3.0.0, the mod now includes Mythic set items, Mythic crafting and affix systems, additional Runewords,
              and new in-game reference menus for cube recipes, crafting recipes, and Runewords.
            </p>
            <p class="card-text">
              The design goal is to make item farming more exciting and provide late game options to replace commonly used items, 
              while staying true to the concept of their original counterparts. All features are optional and can be toggled individually.
            </p>
            <div class="d-flex justify-content-center gap-3 mt-4">
              <a href="https://www.nexusmods.com/diablo2resurrected/mods/745" target="_blank" class="btn btn-primary">
                🔗 NexusMods Page
              </a>
              <a href="https://discord.com/invite/navsmD3Ec9" target="_blank" class="btn btn-primary">
                💬 Join Discord <span class="badge bg-success ms-2">Updated</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Why Play Section -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Why Should I Play It?</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              You may think "Just some better uniques? It's just a different tier of items I'm looking for."
              The thrill is, that you cannot target farm these items to complete a whole character. This would be as insane as trying to farm all the uniques you need in their ethereal version - literally the same drop chances!
            </p>
            <p class="card-text">
              Every item by itself is rare enough that I can almost guarantee no one can "grail" all exalted items and usually you will not find the exalted item you are waiting for. 
              Anyway you <em>will</em> find these items - because there are many and <em>every</em> unique item can drop as exalted.
            </p>
            <p class="card-text">
              If you find a really strong one, there is a good chance you want to build a character around it.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Exalted & Mythic Sections -->
    <div class="row mt-4">
      <div class="col-md-6">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Exalted Items</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">Here is what to expect of exalted items:</p>
            <ul class="feature-list">
              <li>5% chance a unique drops in its exalted version (same chance as for ethereal items)</li>
              <li>"Normal" exalted items are strong options to play through normal and possibly nightmare if upgraded</li>
              <li>"Exceptional" exalted items are very good choices for nightmare and possibly hell</li>
              <li>"Elite" exalted items should all be at least very useful for lategame/endgame content, often best in slot for specific builds</li>
              <li>Among all tiers there are items which open up many new build considerations and even entirely new builds</li>
            </ul>
            <div class="text-center mt-3">
              <router-link to="/items/uniques" class="btn btn-outline-primary">Browse Unique Items</router-link>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Mythic Affixes</h3>
          </div>
          <div class="card-body p-4">
            <p class="card-text">Here is what to expect of Mythic progression:</p>
            <ul class="feature-list">
              <li>Mythic set items introduce a new endgame chase tier</li>
              <li>Mythic crafting chance and new recipes let you add a Mythic Affix to rare or magic items</li>
              <li>Use the tables to see which mythic affixes can roll for each item type and how likely each affix is</li>
            </ul>
            <div class="text-center mt-3">
              <router-link to="/items/mythic-affixes" class="btn btn-outline-primary">Browse Mythic Affixes</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Features & Installation Section -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Features & Installation</h3>
          </div>
          <div class="card-body p-4">
            <div class="section-header">Current Features (v3.0.0)</div>
            <ul class="feature-list">
              <li>All features are optional and work in any combination (can be toggled in D2RMM)</li>
              <li>Exalted unique items</li>
              <li>Mythic set items</li>
              <li>Mythic crafting chance</li>
              <li>Recipes to add a Mythic Affix to rare or magic items</li>
              <li>7 additional Runewords (15 total)</li>
              <li>Cube recipe for socketing (similar to Larzuk's quest reward)</li>
              <li>In-game menus with information about cube recipes, crafting recipes, and Runewords</li>
              <li>Configurable drop chances for Exalted items, Mythic items, and Mythic craft results (1/2/5/10%) via D2RMM</li>
              <li>Configurable option to restrict Exalted and Mythic item drops to Terror Zones only</li>
              <li>Configurable minimum Herald tier required for Sunder Charm drops</li>
              <li>Enable the "Warlord's Glory" set to be droppable (official Asia promo set)</li>
              <li>Enable perfect gem drops (balanced around previous cubing values, so lower gems drop less often)</li>
              <li>Enable teleport while in Wolf/Bear form</li>
            </ul>

            <div class="section-header mt-4">Installation</div>
            <ul class="feature-list">
              <li>Extract the mod to [GamePath]/mods (so you should have mods/RelicsOfSanctuary/RelicsOfSanctuary.mpq/...)</li>
              <li>Create a shortcut of D2R.exe</li>
              <li>Edit the target path by adding -mod RelicsOfSanctuary -txt at the end</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Changelog Section -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h3 class="card-title m-0">Changelog</h3>
          </div>
          <div class="card-body p-4">
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
.feature-list {
  padding-left: 1.5rem;
  margin-bottom: 0;
  list-style-type: none;
}

.feature-list li {
  margin-bottom: 0.5rem;
  position: relative;
}

.feature-list li::before {
  content: '•';
  color: var(--d2r-gold);
  font-weight: bold;
  position: absolute;
  left: -1rem;
}

.changelog-entry {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
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
  content: '•';
  color: var(--d2r-gold);
  font-weight: bold;
  position: absolute;
  left: -1rem;
}
</style>
