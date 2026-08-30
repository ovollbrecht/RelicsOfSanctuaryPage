<script setup>
import meta from '@/assets/meta.json';

/**
 * The front page, which had grown into an archive: five versions of changelog
 * under three paragraphs of prose, and no word about the runewords, the drop
 * calculator or the affix tables - the things the site is actually good at.
 *
 * Every number here comes out of the generated data rather than out of a
 * sentence somebody typed. The old feature list still promised "7 additional
 * Runewords (15 total)" while the mod shipped forty-odd.
 */
const counts = meta.counts ?? {};

// The page is written in English, so the date is too - the visitor's locale
// would put a German month in the middle of an English sentence.
const generatedOn = meta.generatedAt
  ? new Date(meta.generatedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
  : null;

// What the mod puts in the game, in the order somebody meets it.
const highlights = [
  {
    value: counts.exalted,
    label: 'Exalted uniques',
    hint: 'every unique item has one',
    to: '/items/uniques',
  },
  {
    value: counts.uniquesNew,
    label: 'New uniques',
    hint: 'bases nobody had claimed',
    to: '/items/uniques',
  },
  {
    value: counts.runewordsNew,
    label: 'New runewords',
    hint: `of ${counts.runewords ?? ''} on the page`,
    to: '/runewords',
  },
  {
    value: counts.runewordsReworked,
    label: 'Reworked runewords',
    hint: 'vanilla words worth making',
    to: '/runewords',
  },
  {
    value: counts.mythicSetItems,
    label: 'Mythic set items',
    hint: `across ${counts.mythicSets ?? ''} sets`,
    to: '/items/sets',
  },
  {
    value: counts.affixesReworked,
    label: 'Reworked affixes',
    hint: 'large and grand charms',
    to: '/items/affixes',
  },
].filter((entry) => entry.value);

// The pages that answer a question rather than list a table.
const tools = [
  {
    title: 'Drop Calculator',
    question: 'What can this monster drop, and how often?',
    to: '/drop-calc',
  },
  {
    title: 'Runewords',
    question: 'I found a long staff with three sockets - what fits in it?',
    to: '/runewords',
  },
  {
    title: 'Unique Items',
    question: 'What does the exalted version of this item roll?',
    to: '/items/uniques',
  },
  {
    title: 'Affix Calculator',
    question: 'Which affixes can this base still roll at my level?',
    to: '/items/affixes',
  },
];
</script>

<template>
  <div class="container py-4 page-content">
    <!-- What this is, in one breath -->
    <div class="row">
      <div class="col-12 text-center">
        <h1 class="display-4 mb-3">
          <span class="title-icon">⚔</span>
          Relics Of Sanctuary
          <span class="title-icon">⚔</span>
        </h1>
        <p class="lead mb-3">
          A Diablo II: Resurrected mod that keeps the item hunt going: an exalted version of
          every unique, mythic sets and affixes, and a runeword list worth reading again.
        </p>
        <div class="d-flex justify-content-center flex-wrap gap-3">
          <a href="https://www.nexusmods.com/diablo2resurrected/mods/745" target="_blank" class="btn btn-primary">
            🔗 Download on NexusMods
          </a>
          <a href="https://discord.com/invite/navsmD3Ec9" target="_blank" class="btn btn-outline-primary">
            💬 Join the Discord
          </a>
        </div>
        <p v-if="meta.modVersion" class="stamp mt-3 mb-0">
          Version {{ meta.modVersion }}<template v-if="generatedOn"> · data from {{ generatedOn }}</template>
        </p>
      </div>
    </div>

    <!-- The numbers, straight out of the data -->
    <div class="row g-3 mt-3">
      <div v-for="item in highlights" :key="item.label" class="col-6 col-lg-4">
        <router-link :to="item.to" class="highlight card card-enhanced card-hover h-100">
          <div class="card-body text-center p-3">
            <div class="highlight-value">{{ item.value }}</div>
            <div class="highlight-label">{{ item.label }}</div>
            <div class="highlight-hint">{{ item.hint }}</div>
          </div>
        </router-link>
      </div>
    </div>

    <!-- Why it is worth playing -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 card-title m-0">Why Play It?</h2>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              Exalted uniques are improved versions of the items you already know - stronger, and
              often with a twist that changes what the item is for. They drop at the same rate as
              an ethereal item does, which means you cannot target farm them: you will not get the
              one you are waiting for, but you <em>will</em> keep finding ones you did not expect.
              Find a strong one and there is a good chance you build a character around it.
            </p>
            <p class="card-text">
              Around that sit the parts that make the rest of the game worth searching again:
              mythic set items and mythic affixes as an endgame tier, new uniques on bases nobody
              had claimed, and runewords - both new ones and the vanilla words that nobody built
              because the numbers never justified the runes.
            </p>
            <p class="card-text mb-0">
              Everything is optional and every part works on its own -
              <router-link to="/options">the full list of options</router-link> says what each one
              does, and what the standalone archive already contains.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- The pages that answer a question -->
    <div class="row g-3 mt-1">
      <div v-for="tool in tools" :key="tool.title" class="col-md-6">
        <router-link :to="tool.to" class="tool card card-enhanced card-hover h-100">
          <div class="card-body p-3">
            <div class="tool-title">{{ tool.title }}</div>
            <div class="tool-question">{{ tool.question }}</div>
          </div>
        </router-link>
      </div>
    </div>

    <!-- The two progression tiers, each with its own page -->
    <div class="row mt-4 g-4">
      <div class="col-md-6">
        <div class="card h-100 card-enhanced card-hover">
          <div class="card-header card-header-primary">
            <h2 class="h4 card-title m-0">Exalted Items</h2>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              <strong>{{ counts.exalted }}</strong> exalted uniques - one for every unique item in
              the game, each rolling at a 5% chance in place of the ordinary one.
            </p>
            <ul class="feature-list">
              <li>Normal-tier exalted items carry you through normal and, upgraded, into nightmare</li>
              <li>Exceptional ones are strong choices for nightmare and often hell</li>
              <li>Elite ones are endgame gear, frequently best in slot for a particular build</li>
              <li>Across every tier there are items that open builds the original never supported</li>
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
            <h2 class="h4 card-title m-0">Mythic Progression</h2>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              <strong>{{ counts.mythicSetItems }}</strong> mythic set items across
              {{ counts.mythicSets }} sets, plus a mythic affix you can craft onto rare and magic
              items.
            </p>
            <ul class="feature-list">
              <li>Mythic set items are a chase tier of their own, next to the exalted uniques</li>
              <li>Recipes add a mythic affix to an item you already have</li>
              <li>The tables show which affixes each item type can roll, and how likely each is</li>
            </ul>
            <div class="text-center mt-3">
              <router-link to="/items/mythic-affixes" class="btn btn-outline-primary">Browse Mythic Affixes</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- How to get it running -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-header card-header-primary">
            <h2 class="h4 card-title m-0">Getting Started</h2>
          </div>
          <div class="card-body p-4">
            <p class="card-text">
              Two downloads, one mod. The <strong>D2RMM version</strong> builds the game files when
              you install it and lets you set every option; the <strong>standalone version</strong>
              is that same install with the defaults already baked in.
            </p>
            <div class="section-header">Standalone, in three steps</div>
            <ol class="step-list">
              <li>Extract the archive into <code>[GamePath]/mods</code>, so you have
                <code>mods/RelicsOfSanctuary/RelicsOfSanctuary.mpq/…</code></li>
              <li>Make a shortcut of <code>D2R.exe</code></li>
              <li>Add <code>-mod RelicsOfSanctuary -txt</code> to the shortcut's target</li>
            </ol>
            <p class="card-text mb-0">
              With D2RMM, install the mod from the manager instead and pick your options there -
              <router-link to="/options">what each option changes</router-link> is listed page by
              page.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- The history lives on its own page now -->
    <div class="row mt-4">
      <div class="col-12">
        <div class="card card-enhanced">
          <div class="card-body p-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <div class="section-header mb-1">Changelog</div>
              <p class="card-text mb-0">What changed in this version and every one before it.</p>
            </div>
            <router-link to="/changelog" class="btn btn-outline-primary">Read the changelog</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stamp {
  font-size: 0.85rem;
  color: var(--d2r-muted);
}

/* The counters: the number is the message, the rest is the caption. */
.highlight,
.tool {
  display: block;
  text-decoration: none;
  color: inherit;
}

.highlight-value {
  font-family: var(--font-display);
  font-size: 1.9rem;
  line-height: 1.1;
  color: var(--d2r-gold-bright);
}

.highlight-label {
  font-weight: 600;
  color: var(--d2r-text);
}

.highlight-hint {
  font-size: 0.82rem;
  color: var(--d2r-muted);
}

.tool-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--d2r-gold-bright);
}

.tool-question {
  font-size: 0.9rem;
  color: var(--d2r-muted);
}

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

.step-list {
  padding-left: 1.25rem;
  margin-bottom: 1rem;
}

.step-list li {
  margin-bottom: 0.4rem;
}

.step-list code {
  color: var(--d2r-gold);
}
</style>
