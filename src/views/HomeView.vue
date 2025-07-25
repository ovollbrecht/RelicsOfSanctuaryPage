<script setup>
</script>

<template>
  <div class="container py-4">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4 text-warning">
          <span class="title-icon">⚔</span> 
          Relics Of Sanctuary 
          <span class="title-icon">⚔</span>
        </h1>
        <p class="lead">A Diablo 2 Resurrected Mod with Exalted Unique Items and Enhanced Gameplay Features</p>
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
              Relics of Sanctuary adds a 5% chance for each unique item to drop in "exalted" quality. 
              These items are improved versions of their original counterparts with higher stats and often additional tweaks.
            </p>
            <p class="card-text">
              The mod also includes new runewords, enhanced crafting options, improved cube recipes, and various quality-of-life changes
              to make your Diablo 2 experience more enjoyable and diverse.
            </p>
            <p class="card-text">
              The design goal is to make item farming more exciting and provide late game options to replace commonly used items, 
              while staying true to the concept of their original counterparts. All features are optional and can be toggled individually.
            </p>
            <div class="d-flex justify-content-center gap-3 mt-4">
              <a href="https://www.nexusmods.com/diablo2resurrected/mods/745" target="_blank" class="btn btn-primary">
                🔗 NexusMods Page
              </a>
              <a href="https://discord.gg/MJnErBPu" target="_blank" class="btn btn-primary">
                💬 Join Discord
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

    <!-- Content Section -->
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
            <h3 class="card-title m-0">Features & Installation</h3>
          </div>
          <div class="card-body p-4">
            <div class="section-header">Current Features</div>
            <ul class="feature-list">
              <li>All features are optional and work in any combination (can be toggled in D2RMM)</li>
              <li>Exalted unique items (5% chance)</li>
              <li>8 new Runewords (mid-tier for each class-specific item)</li>
              <li>Crafting: Allow all weapons, helmets, boots, shields, belts, gloves, armors instead of specific ones</li>
              <li>Crafting: 5% chance the result will be ethereal (same chance as dropped items)</li>
              <li>Crafting: Add Recipes for Diamonds and Topaz</li>
              <li>Cube: Rune upgrades without gems (higher runes require a simple key)</li>
              <li>Duriel: Remove TP-drop mechanic, so he drops like other bosses</li>
              <li>Wolf/Bear: Allow using Teleport</li>
              <li>Andariel/Questdrops: Restored normal drop table with 20% chance for quest drop for any boss</li>
              <li>Sunder charms have an equal drop chance</li>
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
/* Enhanced Typography */
.display-4 {
  font-family: 'EB Garamond', serif;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  color: var(--d2r-gold);
  border-bottom: 2px solid var(--d2r-gold);
  padding-bottom: 0.5rem;
  text-align: center;
  background: linear-gradient(to bottom, rgba(20, 10, 0, 0.7), transparent);
}

.title-icon {
  font-size: 0.8em;
  vertical-align: middle;
  margin: 0 0.5rem;
  opacity: 0.8;
  text-shadow: 0 0 10px var(--d2r-gold);
  display: inline-block;
}

.text-warning {
  color: var(--d2r-gold);
}

.lead {
  color: var(--d2r-text);
  text-align: center;
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  margin-bottom: 2rem;
}

/* Card Styles */
.card {
  margin-bottom: 1.5rem;
  /* transition removed */
}

.card-hover:hover {
  /* Animation removed */
}

.btn-primary {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  border-color: var(--d2r-gold);
  color: var(--d2r-text);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #7e4200, #5a3000);
  border-color: var(--d2r-highlight);
  color: var(--d2r-gold);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.btn-outline-primary {
  border-color: var(--d2r-gold);
  color: var(--d2r-gold);
  background: transparent;
}

.btn-outline-primary:hover {
  background-color: rgba(198, 156, 109, 0.2);
  color: var(--d2r-highlight);
  border-color: var(--d2r-highlight);
}

/* Feature Lists */
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

/* Changelog Styles */
.changelog-entry {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--d2r-border);
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

.section-header {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  color: var(--d2r-gold);
  font-weight: 600;
  border-bottom: 2px solid var(--d2r-gold);
  padding: 0.5rem;
  margin-bottom: 1rem;
  position: relative;
  border-radius: 0.25rem 0.25rem 0 0;
}

.card-header-primary {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  border-bottom: 2px solid var(--d2r-gold);
  position: relative;
}

/* Mobile Responsive Styles */
@media (max-width: 767.98px) {
  .display-4 {
    font-size: 1.8rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
  }

  .title-icon {
    font-size: 0.7em;
    margin: 0 0.3rem;
  }

  .lead {
    font-size: 1rem;
    margin-bottom: 1.5rem;
  }

  .card-body {
    padding: 1rem !important;
  }
}
</style>
