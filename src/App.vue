<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import { locale, setLocale, t } from '@/i18n'
import { farmPlannerEnabled } from '@/composables/useFarmList.js'
// the German text needs another pass before the switch returns (next version)
const languageSwitchEnabled = false
import logoUrl from '@/assets/RelicsOfSancturay-symbol.png'
import dataMeta from '@/assets/meta.json'

const dataStamp = computed(() => {
  const date = dataMeta.generatedAt ? dataMeta.generatedAt.substring(0, 10) : null
  const version = dataMeta.modVersion ? `v${dataMeta.modVersion}` : null
  return [version, date && `${t('data')} ${date}`].filter(Boolean).join(' · ')
})

// The menu in four shelves: what there is to find, what to work it out
// with, where to farm it, and the mod itself.
const navGroups = [
  { label: 'Items', items: [
    { to: '/items/uniques', label: 'Uniques' },
    { to: '/items/sets', label: 'Sets' },
    { to: '/runewords', label: 'Runewords' },
    { to: '/items/crafting', label: 'Crafting' },
    { to: '/items/cube', label: 'Horadric Cube' },
    { to: '/items/mythic-affixes', label: 'Mythic Affixes' },
  ] },
  { label: 'Calculators', items: [
    { to: '/drop-calc', label: 'Drop Calculator' },
    { to: '/items/affixes', label: 'Affix Calculator' },
  ] },
  { label: 'Farming', items: [
    { to: '/terror-zones', label: 'Terror Zones', hint: 'live' },
    ...(farmPlannerEnabled ? [
      { to: '/where-to-farm', label: 'Where to Farm' },
      { to: '/tonight', label: 'Tonight' },
    ] : []),
    { to: '/grail', label: 'Grail' },
  ] },
  { label: 'The mod', items: [
    { to: '/options', label: 'Options' },
    { to: '/changelog', label: 'Changelog' },
  ] },
]

const isSidebarOpen = ref(false)
const isWideScreen = ref(false)
const wasWideScreen = ref(false)

// Safely check if window exists (for SSR compatibility)
const updateWindowWidth = () => {
  if (typeof window === 'undefined') return

  const wide = window.innerWidth >= 992
  isWideScreen.value = wide

  if (wide && !wasWideScreen.value) {
    isSidebarOpen.value = true
  }

  if (!wide && wasWideScreen.value) {
    isSidebarOpen.value = false
  }

  wasWideScreen.value = wide
}

// Initialize on client-side only
onMounted(() => {
  updateWindowWidth()

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateWindowWidth)
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleKeydown)
  }
})

// Clean up event listeners
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateWindowWidth)
    window.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleKeydown)
  }
})

const search = ref(null)
const openSearch = () => { search.value?.show(); if (!isWideScreen.value) isSidebarOpen.value = false }

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const handleKeydown = (event) => {
  if (event.key === 'Escape' && !isWideScreen.value && isSidebarOpen.value) {
    isSidebarOpen.value = false
  }
}

// Close sidebar when clicking outside on mobile
const handleClickOutside = (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  if (!isWideScreen.value && isSidebarOpen.value && !target.closest('.sidebar') && !target.closest('.hamburger-menu')) {
    isSidebarOpen.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <button
      class="btn hamburger-menu d-lg-none position-fixed top-0 start-0 mt-3 ms-3"
      @click="toggleSidebar"
      :aria-expanded="isSidebarOpen"
      aria-controls="sidebar"
      :aria-label="$t('Toggle navigation')"
    >
      <span class="navbar-toggler-icon"></span>
    </button>
    <button class="btn search-fab d-lg-none position-fixed top-0 end-0 mt-3 me-3" :aria-label="$t('Search')" :title="$t('Search')" @click="openSearch">⌕</button>

    <aside id="sidebar" class="sidebar" :class="{ show: isSidebarOpen }" aria-label="Primary navigation">
      <div class="sidebar-header">
        <div class="brand">
          <img :src="logoUrl" alt="Relics Of Sanctuary" class="brand-mark" />
          <div class="brand-text">
            <span class="brand-kicker">Relics Of</span>
            <span class="brand-title">Sanctuary</span>
          </div>
        </div>
        <button class="btn-close btn-close-white d-lg-none" @click="toggleSidebar" :aria-label="$t('Close navigation')"></button>
      </div>

      <nav class="sidebar-nav">
        <button type="button" class="sidebar-search" :title="$t('Search everything - items, runewords, recipes, zones, monsters')" @click="openSearch">
          <span>⌕ {{ $t('Search') }}</span><kbd>⌘K</kbd>
        </button>
        <router-link to="/" class="sidebar-link home-link" @click="!isWideScreen && (isSidebarOpen = false)">{{ $t('Home') }}</router-link>
        <div v-for="group in navGroups" :key="group.label" class="nav-group">
          <div class="nav-group-label">{{ $t(group.label) }}</div>
          <router-link v-for="item in group.items" :key="item.to" :to="item.to" class="sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">
            <span>{{ $t(item.label) }}</span>
            <span v-if="item.hint" class="nav-hint">{{ item.hint }}</span>
          </router-link>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div v-if="languageSwitchEnabled" class="lang-switch" role="group" :aria-label="$t('Language')">
          <button type="button" :class="{ on: locale === 'en' }" @click="setLocale('en')">EN</button>
          <button type="button" :class="{ on: locale === 'de' }" @click="setLocale('de')">DE</button>
        </div>
        {{ $t('Build your legend with exalted relics and rune-crafted power.') }}
        <div v-if="dataStamp" class="data-stamp">{{ dataStamp }}</div>
      </div>
    </aside>

    <div class="sidebar-scrim" v-if="isSidebarOpen && !isWideScreen" @click="toggleSidebar"></div>

    <GlobalSearch ref="search" />

    <main class="main-content">
      <div class="content-shell">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1050;
  width: 260px;
  height: 100vh;
  overflow-y: auto;
  background-color: var(--d2r-panel);
  color: var(--d2r-text);
  border-right: 1px solid rgba(59, 42, 31, 0.8);
  transform: translateX(-100%);
  transition: transform 0.25s ease;
}

.sidebar.show {
  transform: translateX(0);
  box-shadow: var(--d2r-shadow);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.25rem;
  background: linear-gradient(90deg, #3a1e00, #111111);
  border-bottom: 1px solid rgba(59, 42, 31, 0.8);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-mark {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(201, 163, 106, 0.35));
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.brand-kicker {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.35em;
  color: rgba(194, 176, 143, 0.7);
}

.brand-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--d2r-gold);
}

.sidebar-search {
  display: flex; justify-content: space-between; align-items: center; width: calc(100% - 1.5rem); margin: 0.25rem 0.75rem 0.5rem;
  padding: 0.4rem 0.75rem; font-size: 0.9rem; color: var(--d2r-muted); background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(201, 163, 106, 0.25); border-radius: 0.4rem; cursor: pointer;
}
.sidebar-search:hover { color: var(--d2r-text); border-color: rgba(201, 163, 106, 0.5); }
.sidebar-search kbd { font-size: 0.7rem; padding: 0.05rem 0.35rem; color: var(--d2r-muted); background: transparent; border: 1px solid rgba(201, 163, 106, 0.3); border-radius: 0.25rem; }
.search-fab { z-index: 1030; font-size: 1.3rem; line-height: 1; padding: 0.35rem 0.6rem; color: var(--d2r-gold); background: var(--d2r-panel); border: 1px solid rgba(201, 163, 106, 0.4); }

.sidebar-nav {
  padding: 0.75rem 0.75rem 0.5rem;
}

.nav-group {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(201, 163, 106, 0.12);
}

.nav-group-label {
  font-family: var(--font-display);
  font-size: 0.62rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(201, 163, 106, 0.65);
  padding: 0.15rem 0.9rem 0.35rem;
}

.sidebar-link {
  color: var(--d2r-text) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.38rem 0.9rem;
  border-radius: 8px;
  border: 1px solid transparent;
  text-decoration: none;
  font-size: 0.98rem;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.home-link {
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}

.nav-hint {
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--d2r-gold);
  opacity: 0.8;
}

.sidebar-link:hover {
  background: rgba(201, 163, 106, 0.12);
  color: var(--d2r-gold);
}

.sidebar-link.router-link-active {
  background: rgba(201, 163, 106, 0.2);
  color: var(--d2r-gold-bright) !important;
  border-color: rgba(201, 163, 106, 0.4);
}
.home-link.router-link-active:not(.router-link-exact-active) {
  background: transparent;
  border-color: transparent;
  color: var(--d2r-text) !important;
}

.lang-switch { display: flex; width: max-content; gap: 0; margin-bottom: 0.6rem; border: 1px solid rgba(201, 163, 106, 0.3); border-radius: 0.3rem; overflow: hidden; }
.lang-switch button { padding: 0.1rem 0.55rem; font-size: 0.72rem; letter-spacing: 0.06em; color: var(--d2r-muted); background: transparent; border: 0; cursor: pointer; }
.lang-switch button.on { color: var(--d2r-gold-bright); background: rgba(201, 163, 106, 0.16); }

.sidebar-footer {
  padding: 0 1.25rem 1.5rem;
  color: rgba(194, 176, 143, 0.7);
  font-size: 0.85rem;
  line-height: 1.4;
}

.data-stamp {
  margin-top: 0.5rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(194, 176, 143, 0.5);
}

.hamburger-menu {
  width: 44px;
  height: 44px;
  z-index: 1060;
  background: var(--d2r-bg-glass);
  border: 1px solid rgba(59, 42, 31, 0.8);
  color: var(--d2r-gold);
  border-radius: 12px;
  box-shadow: var(--d2r-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.hamburger-menu:hover {
  color: var(--d2r-gold-bright);
}

.hamburger-menu .navbar-toggler-icon {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28201, 163, 106, 0.9%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}

.sidebar-scrim {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 5, 0.6);
  z-index: 1040;
}

.main-content {
  min-height: 100vh;
  padding: 2rem 1.5rem 3rem;
}

.content-shell {
  max-width: 1200px;
  margin: 0 auto;
}

@media (min-width: 992px) {
  .sidebar {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 260px;
  }
}
</style>
