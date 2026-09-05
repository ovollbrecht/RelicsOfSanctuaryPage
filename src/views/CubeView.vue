<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import cube from '@/assets/cube.json';
import { iconUrl } from '@/composables/useItemIcon.js';

/**
 * The Horadric Cube: every recipe the game and the mod know, on ten shelves.
 * Ingredients are chips coloured by what they are - rune, gem, quality of the
 * item - and the result stands to the right with what the recipe does to it.
 * Recipes the mod added carry a Relics mark; ones it changed a "changed" mark.
 */
const route = useRoute();
const router = useRouter();

const categories = cube.Categories;
const recipes = cube.Recipes;

const query = ref('');
const modOnly = ref(false);
const activeCategory = ref(null); // null = all shelves

const normalized = computed(() => query.value.trim().toLowerCase());
const matches = (r) => (!modOnly.value || r.Origin !== 'vanilla') && (!normalized.value || r.Search.includes(normalized.value));
const filtered = computed(() => recipes.filter(matches));
const countBy = computed(() => {
  const m = {};
  for (const r of filtered.value) m[r.Category] = (m[r.Category] ?? 0) + 1;
  return m;
});
const modCount = computed(() => recipes.filter((r) => r.Origin !== 'vanilla').length);
// the order the groups read best in, where the file's order does not
const GROUP_ORDER = {
  crafting: ['Blood', 'Caster', 'Hit Power', 'Safety', 'Discovery', 'Eternity'],
  mythic: ['Forging the Standard', 'Magic items', 'Rare items'],
  socketing: ['Normal items', 'Magic items', 'Rare items', 'With the four Essences', 'Clearing sockets'],
  upgrading: ['Unique items', 'Rare items', 'Set items', 'Low quality to normal'],
  rerolling: ['Rerolls', 'Rings & amulets', 'Magic items with a fixed affix'],
  quests: ['Quest items', 'Portals', 'Token of Absolution', 'Worldstone & Ancients'],
};
const groupRank = (cat, title) => { const i = (GROUP_ORDER[cat] ?? []).indexOf(title); return i < 0 ? 99 : i; };
const shelves = computed(() => categories
  .filter((c) => (activeCategory.value == null || c.Id === activeCategory.value) && (countBy.value[c.Id] ?? 0) > 0)
  .map((c) => {
    const list = filtered.value.filter((r) => r.Category === c.Id);
    const groups = [];
    for (const r of list) {
      let g = groups.find((x) => x.title === r.Group);
      if (!g) groups.push(g = { title: r.Group, recipes: [] });
      g.recipes.push(r);
    }
    groups.sort((a, b) => groupRank(c.Id, a.title) - groupRank(c.Id, b.title));
    return { ...c, count: list.length, groups };
  }));
// the compact views only make sense when nothing is filtered away
const compact = computed(() => !normalized.value);
const showVanillaRunes = ref(false);

// one line per craft: base, rune, gem
const craftRow = (r) => ({
  r, base: r.Inputs[0], rune: r.Inputs.find((i) => i.Kind === 'rune'), gem: r.Inputs.find((i) => i.Kind === 'gem'),
  extra: r.Inputs.filter((i) => i.Kind !== 'rune' && i.Kind !== 'gem' && i !== r.Inputs[0]),
});
// the five forging recipes differ only in the statue
const forging = (group) => {
  const first = group.recipes[0];
  return { statues: group.recipes.map((x) => x.Inputs[0].Text), shards: first.Inputs.filter((i) => i.Kind === 'shard'), out: first };
};
// the eleven essence recipes are three rules
const essenceLines = (group) => {
  const q = (r) => r.Inputs[0].Quality;
  const pick = (test) => group.recipes.filter(test);
  const lines = [
    { items: 'Any low quality, normal or superior item', recipes: pick((r) => ['Low Quality', 'Normal', 'Superior'].includes(q(r))) },
    { items: 'Any magic helm, body armor, weapon or shield', recipes: pick((r) => q(r) === 'Magic') },
    { items: 'Any rare, set, unique or crafted item', recipes: pick((r) => ['Rare', 'Set', 'Unique', 'Crafted'].includes(q(r))) },
  ].filter((l) => l.recipes.length);
  return lines.map((l) => ({ ...l, essences: l.recipes[0].Inputs.filter((i) => i.Kind === 'essence'), title: l.recipes[0].Title, note: l.recipes[0].Notes.filter((n) => n.startsWith('gets')).join(' · ') }));
};

// ---------- rune ladder ----------
const runeNumber = (code) => Number((code ?? '').replace(/^r/, '')) || 0;
const runeLadder = computed(() => {
  const rows = new Map(); // result rune code -> { to, from, qty, gem, alone }
  for (const r of recipes) {
    if (r.Category !== 'runes') continue;
    const rune = r.Inputs.find((i) => i.Kind === 'rune');
    const gem = r.Inputs.find((i) => i.Kind === 'gem');
    const row = rows.get(r.Output.Code) ?? { to: r.Output.Text, toCode: r.Output.Code, from: rune?.Text, fromCode: rune?.Code, qty: rune?.Qty ?? 1, gem: null, gemCode: null, alone: false };
    if (gem) { row.gem = gem.Text; row.gemCode = gem.Code; } else row.alone = true;
    rows.set(r.Output.Code, row);
  }
  return [...rows.values()].sort((a, b) => runeNumber(a.toCode) - runeNumber(b.toCode));
});

// ---------- gem grid ----------
const GEM_FAMILIES = ['Amethyst', 'Diamond', 'Emerald', 'Ruby', 'Sapphire', 'Topaz', 'Skull'];
const GRADES = ['Chipped', 'Flawed', 'Standard', 'Flawless', 'Perfect'];
const gemGrid = computed(() => GEM_FAMILIES.map((family) => {
  const steps = recipes.filter((r) => r.Category === 'gems' && r.Output.Text.includes(family))
    .map((r) => ({ from: r.Inputs[0].Text, qty: r.Inputs[0].Qty, to: r.Output.Text }));
  return { family, steps };
}));

// ---------- looks ----------
const gemClass = (text) => {
  const t = text.toLowerCase();
  if (t.includes('amethyst')) return 'gem-amethyst';
  if (t.includes('diamond')) return 'gem-diamond';
  if (t.includes('emerald')) return 'gem-emerald';
  if (t.includes('ruby')) return 'gem-ruby';
  if (t.includes('sapphire')) return 'gem-sapphire';
  if (t.includes('topaz')) return 'gem-topaz';
  if (t.includes('skull')) return 'gem-skull';
  return 'gem-any';
};
const qualityClass = (q) => ({ Magic: 'q-magic', Rare: 'q-rare', Unique: 'q-unique', Set: 'q-set', Crafted: 'q-crafted', Superior: 'q-superior', 'Low Quality': 'q-low', Tempered: 'q-crafted' }[q] ?? '');
const chipClass = (i) => {
  if (i.Kind === 'gem') return ['k-gem', gemClass(i.Text)];
  if (i.Kind === 'rune') return 'k-rune';
  if (i.Kind === 'essence') return 'k-essence';
  if (i.Kind === 'key' || i.Kind === 'organ') return 'k-key';
  if (i.Kind === 'statue' || i.Kind === 'shard' || i.Kind === 'standard') return 'k-relic';
  if (i.Kind === 'potion') return 'k-potion';
  if (i.Kind === 'unique') return 'q-unique';
  return qualityClass(i.Quality);
};
const resultClass = (r) => {
  const o = r.Output;
  if (o.Kind === 'rune') return 'k-rune';
  if (o.Kind === 'gem') return ['k-gem', gemClass(o.Text)];
  if (o.Kind === 'portal') return 'k-portal';
  if (o.Kind === 'standard' || o.Kind === 'unique') return 'k-relic';
  if (r.Category === 'crafting') return 'q-crafted';
  if (r.Category === 'mythic') return 'k-mythic';
  return qualityClass(o.Quality);
};
const runeLink = (name) => ({ path: '/runewords', query: { q: name.replace(/ Rune$/, '') } });

// ---------- URL ----------
onMounted(() => {
  if (typeof route.query.q === 'string') query.value = route.query.q;
  if (route.query.mod === '1') modOnly.value = true;
  if (typeof route.query.cat === 'string' && categories.some((c) => c.Id === route.query.cat)) activeCategory.value = route.query.cat;
});
watch([query, modOnly, activeCategory], () => {
  router.replace({ query: { ...(query.value ? { q: query.value } : {}), ...(modOnly.value ? { mod: '1' } : {}), ...(activeCategory.value ? { cat: activeCategory.value } : {}) } });
});
const jump = (id) => {
  activeCategory.value = null;
  requestAnimationFrame(() => document.getElementById(`shelf-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};
</script>

<template>
  <div class="container py-4 page-content cube-page">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">Horadric Cube</h1>
        <p class="text-muted mb-0">Every recipe the cube knows, on ten shelves. What the mod added is marked <span class="badge origin-mod">Relics</span>, what it changed <span class="badge origin-changed">changed</span>.</p>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <input v-model="query" class="form-control form-control-sm search" placeholder="Search an ingredient or a result…" />
        <div class="form-check form-switch small mb-0">
          <input id="mod-only" v-model="modOnly" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="mod-only">Relics only <span class="text-muted">({{ modCount }})</span></label>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <!-- shelves -->
      <div class="col-lg-3">
        <div class="card card-enhanced shelf-nav">
          <div class="card-body p-2">
            <button class="shelf-link" :class="{ active: activeCategory == null }" @click="activeCategory = null">
              <span>All shelves</span><span class="count">{{ filtered.length }}</span>
            </button>
            <button v-for="c in categories" :key="c.Id" class="shelf-link" :class="{ active: activeCategory === c.Id, empty: !countBy[c.Id] }" :disabled="!countBy[c.Id]" @click="activeCategory === c.Id ? jump(c.Id) : (activeCategory = c.Id)">
              <span>{{ c.Title }}</span><span class="count">{{ countBy[c.Id] ?? 0 }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="col-lg-9">
        <div v-if="shelves.length === 0" class="card card-enhanced"><div class="card-body text-muted">No recipe matches that.</div></div>

        <section v-for="shelf in shelves" :id="`shelf-${shelf.Id}`" :key="shelf.Id" class="shelf card card-enhanced mb-4">
          <div class="card-header card-header-primary">
            <h2 class="h5 card-title m-0">{{ shelf.Title }}<span class="text-muted fw-normal small"> · {{ shelf.count }}</span></h2>
            <p class="small text-muted mb-0 mt-1">{{ shelf.Blurb }}<router-link v-if="shelf.Id === 'crafting'" to="/items/crafting" class="ms-1">The crafting table with every affix →</router-link></p>
          </div>

          <!-- runes: one ladder, the mod's way first -->
          <div v-if="shelf.Id === 'runes' && compact && !modOnly" class="card-body p-0">
            <div class="px-3 pt-2 pb-1">
              <div class="form-check form-switch small mb-0">
                <input id="vanilla-runes" v-model="showVanillaRunes" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="vanilla-runes">Show the game's recipes, which need a gem as well</label>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-dark table-sm mb-0 align-middle ladder">
                <thead><tr><th>Runes</th><th></th><th>Result</th><th v-if="showVanillaRunes">In the game: same runes plus</th></tr></thead>
                <tbody>
                  <tr v-for="row in runeLadder" :key="row.toCode">
                    <td class="text-nowrap"><span class="qty">{{ row.qty }} ×</span> <span class="chip k-rune"><img v-if="iconUrl(row.fromCode)" :src="iconUrl(row.fromCode)" class="ico" alt="" />{{ row.from }}</span></td>
                    <td class="arrow-cell">→</td>
                    <td><router-link :to="runeLink(row.to)" class="chip k-rune"><img v-if="iconUrl(row.toCode)" :src="iconUrl(row.toCode)" class="ico" alt="" />{{ row.to }}</router-link><span v-if="row.gem && showVanillaRunes" class="badge origin-mod ms-2">Relics</span></td>
                    <td v-if="showVanillaRunes"><span v-if="row.gem" class="chip k-gem" :class="gemClass(row.gem)"><img v-if="iconUrl(row.gemCode)" :src="iconUrl(row.gemCode)" class="ico" alt="" />{{ row.gem }}</span><span v-else class="text-muted small">nothing - the game asks no gem here</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- gems: one grid instead of 28 lines -->
          <div v-else-if="shelf.Id === 'gems' && compact && !modOnly" class="card-body">
            <div class="gem-grid">
              <div v-for="g in gemGrid" :key="g.family" class="gem-col">
                <div class="gem-family" :class="gemClass(g.family)">{{ g.family }}</div>
                <div v-for="grade in GRADES" :key="grade" class="gem-step" :class="gemClass(g.family)">{{ grade }}</div>
              </div>
            </div>
            <div class="small text-muted mt-2"><span class="qty">3 ×</span> of a grade become one of the next - any family, any time.</div>
          </div>

          <!-- crafting: one aligned line per recipe; the affixes live on the crafting page -->
          <div v-else-if="shelf.Id === 'crafting'" class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-dark table-sm mb-0 align-middle aligned">
                <thead><tr><th>Result</th><th>Magic base</th><th>Rune</th><th>Gem</th><th></th></tr></thead>
                <tbody>
                  <template v-for="g in shelf.groups" :key="g.title">
                    <tr class="group-row"><td colspan="5">{{ g.title }}<span class="text-muted fw-normal"> · {{ g.recipes.length }}</span></td></tr>
                    <tr v-for="c in g.recipes.map(craftRow)" :key="c.r.Id">
                      <td><router-link :to="{ path: '/items/crafting', query: { q: c.r.Title } }" class="title q-crafted">{{ c.r.Title }}</router-link></td>
                      <td><span class="chip" :class="chipClass(c.base)"><img v-if="iconUrl(c.base.Code)" :src="iconUrl(c.base.Code)" class="ico" alt="" />{{ c.base.Text }}</span><span v-if="c.extra.length" class="text-muted small"> + {{ c.extra.map((e) => e.Text).join(' + ') }}</span></td>
                      <td><router-link v-if="c.rune" :to="runeLink(c.rune.Text)" class="chip k-rune"><img v-if="iconUrl(c.rune.Code)" :src="iconUrl(c.rune.Code)" class="ico" alt="" />{{ c.rune.Text }}</router-link></td>
                      <td><span v-if="c.gem" class="chip k-gem" :class="gemClass(c.gem.Text)"><img v-if="iconUrl(c.gem.Code)" :src="iconUrl(c.gem.Code)" class="ico" alt="" />{{ c.gem.Text }}</span></td>
                      <td class="text-end"><span v-if="c.r.Origin === 'mod'" class="badge origin-mod">Relics</span></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div class="small text-muted p-3 pt-2">Every craft adds a jewel to the three above and rolls a 5 % chance at one Exalted affix. The fixed affixes of each craft are on the <router-link to="/items/crafting">crafting page</router-link>.</div>
          </div>

          <!-- the mythic affix: one line per item, the condition once -->
          <div v-else-if="shelf.Id === 'mythic'" class="card-body p-0">
            <template v-for="g in shelf.groups" :key="g.title">
              <div v-if="g.title === 'Forging the Standard'" class="group">
                <div class="group-title">{{ g.title }}</div>
                <div class="recipe mod">
                  <div class="ingredients">
                    <span class="ing"><span class="chip k-relic" :title="forging(g).statues.join(', ')">Any Ancient's statue</span><span class="flags">{{ forging(g).statues.join(', ') }}</span></span>
                    <span class="plus">+</span>
                    <span class="ing"><span class="chip k-relic">the five Worldstone Shards</span><span class="flags">{{ forging(g).shards.map((x) => x.Text.replace(' Worldstone Shard', '')).join(', ') }}</span></span>
                  </div>
                  <div class="arrow">→</div>
                  <div class="result"><div class="result-line"><img v-if="iconUrl('std')" :src="iconUrl('std')" class="ico result-ico" alt="" /><span class="title k-relic">{{ forging(g).out.Title }}</span><span class="badge origin-mod">Relics</span></div></div>
                </div>
              </div>
              <div v-else class="group">
                <div class="group-title">{{ g.title }}<span class="text-muted fw-normal"> · {{ g.recipes.length }}</span></div>
                <table class="table table-dark table-sm mb-0 align-middle aligned">
                  <tbody>
                    <tr v-for="r in g.recipes" :key="r.Id">
                      <td><span class="chip" :class="chipClass(r.Inputs[0])"><img v-if="iconUrl(r.Inputs[0].Code)" :src="iconUrl(r.Inputs[0].Code)" class="ico" alt="" />{{ r.Inputs[0].Text }}</span></td>
                      <td class="text-muted">+ <span class="chip k-relic"><img v-if="iconUrl('std')" :src="iconUrl('std')" class="ico" alt="" />Standard of Heroes</span></td>
                      <td class="text-muted">+ <router-link :to="runeLink(r.Inputs.find((i) => i.Kind === 'rune').Text)" class="chip k-rune"><img v-if="iconUrl(r.Inputs.find((i) => i.Kind === 'rune').Code)" :src="iconUrl(r.Inputs.find((i) => i.Kind === 'rune').Code)" class="ico" alt="" />{{ r.Inputs.find((i) => i.Kind === 'rune').Text }}</router-link></td>
                      <td class="arrow-cell">→</td>
                      <td><span class="title k-mythic">{{ r.Title }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <div class="small text-muted p-3 pt-2">The item keeps its affixes and gains one Exalted affix; it becomes Mythic and cannot take a second. The Standard is used up.</div>
          </div>

          <!-- everything else: one line per recipe -->
          <div v-else class="card-body p-0">
            <div v-for="g in shelf.groups" :key="g.title" class="group">
              <div class="group-title">{{ g.title }}<span class="text-muted fw-normal"> · {{ g.recipes.length }}</span></div>
              <!-- the essence recipes collapse into three rules -->
              <template v-if="g.title === 'With the four Essences' && compact">
                <div v-for="line in essenceLines(g)" :key="line.items" class="recipe mod">
                  <div class="ingredients">
                    <span class="ing"><span class="chip">{{ line.items }}</span><span class="flags">no sockets yet</span></span>
                    <span class="plus">+</span>
                    <span class="ing"><span class="chip k-essence"><img v-for="e in line.essences" :key="e.Code" :src="iconUrl(e.Code)" class="ico" alt="" />the four Essences</span><span class="flags">{{ line.essences.map((e) => e.Text.replace(/ of .*$/, '')).join(', ') }}</span></span>
                  </div>
                  <div class="arrow">→</div>
                  <div class="result">
                    <div class="result-line"><span class="title">{{ line.title }}</span><span class="badge origin-mod">Relics</span></div>
                    <div class="small text-muted">the same item · {{ line.note }}</div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div v-for="r in g.recipes" :key="r.Id" class="recipe" :class="{ mod: r.Origin === 'mod' }">
                  <div class="ingredients">
                    <template v-for="(i, n) in r.Inputs" :key="n">
                      <span v-if="n > 0" class="plus">+</span>
                      <span class="ing">
                        <span v-if="i.Qty > 1" class="qty">{{ i.Qty }} ×</span>
                        <router-link v-if="i.Kind === 'rune'" :to="runeLink(i.Text)" class="chip" :class="chipClass(i)"><img v-if="iconUrl(i.Code)" :src="iconUrl(i.Code)" class="ico" alt="" />{{ i.Text }}</router-link>
                        <span v-else class="chip" :class="chipClass(i)"><img v-if="iconUrl(i.Code)" :src="iconUrl(i.Code)" class="ico" alt="" />{{ i.Text }}</span>
                        <span v-if="i.Flags.length" class="flags">{{ i.Flags.join(', ') }}</span>
                      </span>
                    </template>
                  </div>
                  <div class="arrow">→</div>
                  <div class="result">
                    <div class="result-line">
                      <img v-if="r.Output.Kind !== 'same' && iconUrl(r.Output.Code)" :src="iconUrl(r.Output.Code)" class="ico result-ico" alt="" />
                      <span class="title" :class="resultClass(r)">{{ r.Title }}</span>
                      <span v-if="r.Origin === 'mod'" class="badge origin-mod">Relics</span>
                      <span v-else-if="r.Origin === 'changed'" class="badge origin-changed" title="In the game too, but Relics changed what it does">changed</span>
                      <span v-if="r.Difficulty" class="badge diff-badge">{{ r.Difficulty }}</span>
                    </div>
                    <div v-if="r.Output.Text !== r.Title || r.Notes.length" class="small text-muted">
                      <template v-if="r.Output.Text !== r.Title">{{ r.Output.Text }}</template><template v-if="r.Output.Text !== r.Title && r.Notes.length"> · </template>{{ r.Notes.join(' · ') }}
                    </div>
                    <ul v-if="r.Props.length" class="props">
                      <li v-for="(p, n) in r.Props" :key="n" :class="{ chance: p.Chance < 100 }">{{ p.Description }}<span v-if="p.Chance < 100" class="text-muted"> · {{ p.Chance }} %</span></li>
                    </ul>
                    <div v-if="r.Requires" class="small requires">Only if {{ r.Requires }}.</div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </section>
      </div>
    </div>

    <p class="small text-muted mt-2 mb-0">
      Read from the game's cubemain table as the mod installs it; disabled rows are left out. An item's level after a recipe follows the notes: a share of your
      character level plus a share of the item's own. "Exceptional and elite bases too" means the recipe takes the upgraded versions of the base as well.
    </p>
  </div>
</template>

<style scoped>
.search { width: 18rem; max-width: 100%; }
.shelf-nav { position: sticky; top: 1rem; }
.shelf-link {
  display: flex; justify-content: space-between; align-items: baseline; width: 100%; border: 0; background: none; text-align: left;
  padding: 0.4rem 0.6rem; border-radius: 0.4rem; color: var(--d2r-text); font-family: var(--font-display); font-size: 0.9rem;
}
.shelf-link:hover { background: rgba(255, 255, 255, 0.05); }
.shelf-link.active { background: rgba(201, 163, 106, 0.14); color: var(--d2r-gold-bright); }
.shelf-link.empty { opacity: 0.4; }
.shelf-link .count { font-family: var(--font-body); font-size: 0.8rem; color: var(--d2r-muted); }
.shelf { scroll-margin-top: 1rem; }

.group-title { font-family: var(--font-display); font-size: 0.9rem; color: var(--d2r-gold); padding: 0.6rem 0.9rem 0.25rem; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.group:first-child .group-title { border-top: 0; }
.recipe {
  display: grid; grid-template-columns: minmax(0, 1.25fr) auto minmax(0, 1fr); gap: 0.75rem; align-items: start;
  padding: 0.55rem 0.9rem; border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.recipe.mod { background: rgba(201, 163, 106, 0.04); }
.ingredients { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.4rem; }
.ing { display: inline-flex; align-items: baseline; gap: 0.3rem; flex-wrap: wrap; }
.plus, .arrow { color: var(--d2r-muted); }
.arrow { font-size: 1.1rem; padding-top: 0.05rem; }
.qty { color: var(--d2r-gold-bright); font-weight: 600; font-size: 0.9rem; }
.flags { font-size: 0.75rem; color: var(--d2r-muted); font-style: italic; }
.ico { display: inline-block; width: 20px; height: 20px; object-fit: contain; vertical-align: -5px; margin-right: 0.3rem; }
.result-ico { width: 24px; height: 24px; vertical-align: -6px; margin-right: 0.1rem; }
.chip {
  display: inline-block; padding: 0.05rem 0.5rem; border-radius: 999px; background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.9rem; text-decoration: none; color: var(--d2r-text); line-height: 1.5;
}
a.chip:hover { border-color: currentColor; }
.result-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
.title { font-weight: 600; }
.props { margin: 0.2rem 0 0; padding-left: 1rem; font-size: 0.85rem; }
.props li.chance { color: var(--d2r-muted); }
.requires { color: #ffd27a; }

.k-rune { color: #ffb84d; }
.k-gem { color: #ddd; }
.gem-amethyst { color: #c98cff; }
.gem-diamond { color: #f0f4ff; }
.gem-emerald { color: #7fe07f; }
.gem-ruby { color: #ff7a7a; }
.gem-sapphire { color: #7fb8ff; }
.gem-topaz { color: #ffe066; }
.gem-skull { color: #cfcfcf; }
.gem-any { color: #e8e0cc; }
.k-essence { color: #7fd8d8; }
.k-key { color: #ff9c9c; }
.k-relic { color: var(--d2r-gold-bright); }
.k-potion { color: #ff9ad5; }
.k-portal { color: #e07070; }
.k-mythic { color: #ffe9a8; }
.q-magic { color: #8f8fff; }
.q-rare { color: #ffff8a; }
.q-unique { color: #c7b377; }
.q-set { color: #7fdc7f; }
.q-crafted { color: #ffa54d; }
.q-superior { color: #e8e8e8; }
.q-low { color: #a8a8a8; }

.origin-mod { background: rgba(201, 163, 106, 0.3); color: var(--d2r-gold-bright); font-weight: 600; font-size: 0.65rem; vertical-align: middle; }
.origin-changed { background: rgba(120, 140, 200, 0.3); color: #cfd8ff; font-weight: 500; font-size: 0.65rem; vertical-align: middle; }
.diff-badge { background: rgba(170, 40, 40, 0.4); color: #ffb3b3; font-weight: 500; font-size: 0.65rem; vertical-align: middle; }

.ladder td, .ladder th { padding: 0.35rem 0.75rem; }
.ladder td:first-child, .ladder th:first-child { width: 1%; white-space: nowrap; }
.aligned td, .aligned th { padding: 0.3rem 0.75rem; vertical-align: middle; }
.aligned .group-row td { font-family: var(--font-display); font-size: 0.9rem; color: var(--d2r-gold); background: rgba(255, 255, 255, 0.025); padding-top: 0.5rem; }
.arrow-cell { color: var(--d2r-muted); width: 2rem; text-align: center; }
.gem-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.5rem; }
.gem-col { border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 0.5rem; overflow: hidden; }
.gem-family { font-family: var(--font-display); text-align: center; padding: 0.35rem; background: rgba(255, 255, 255, 0.05); }
.gem-step { text-align: center; padding: 0.25rem; font-size: 0.85rem; border-top: 1px solid rgba(255, 255, 255, 0.05); position: relative; }
.gem-step + .gem-step::before { content: '3 × ↓'; position: absolute; left: 0.4rem; top: 0.25rem; font-size: 0.65rem; color: var(--d2r-muted); }

@media (max-width: 767px) {
  .recipe { grid-template-columns: 1fr; gap: 0.25rem; }
  .arrow { display: none; }
  .result { padding-left: 0.25rem; border-left: 2px solid rgba(201, 163, 106, 0.4); }
  .shelf-nav { position: static; }
}
</style>
