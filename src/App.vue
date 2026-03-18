<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import logoUrl from '@/assets/RelicsOfSancturay-symbol.png'

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
      aria-label="Toggle navigation"
    >
      <span class="navbar-toggler-icon"></span>
    </button>

    <aside id="sidebar" class="sidebar" :class="{ show: isSidebarOpen }" aria-label="Primary navigation">
      <div class="sidebar-header">
        <div class="brand">
          <img :src="logoUrl" alt="Relics Of Sanctuary" class="brand-mark" />
          <div class="brand-text">
            <span class="brand-kicker">Relics Of</span>
            <span class="brand-title">Sanctuary</span>
          </div>
        </div>
        <button class="btn-close btn-close-white d-lg-none" @click="toggleSidebar" aria-label="Close navigation"></button>
      </div>

      <nav class="sidebar-nav">
        <ul class="nav flex-column">
          <li class="nav-item">
            <router-link to="/" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Home</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/items/uniques" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Uniques</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/items/sets" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Sets</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/items/crafting" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Crafting</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/items/mythic-affixes" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Mythic Affixes</router-link>
          </li>
          <li class="nav-item">
            <router-link to="/runewords" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Runewords</router-link>
          </li>
        </ul>
      </nav>

      <div class="sidebar-footer">
        Build your legend with exalted relics and rune-crafted power.
      </div>
    </aside>

    <div class="sidebar-scrim" v-if="isSidebarOpen && !isWideScreen" @click="toggleSidebar"></div>

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

.sidebar-nav {
  padding: 1rem 0.75rem;
}

.sidebar-link {
  color: var(--d2r-text) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.sidebar-link:hover {
  background: rgba(201, 163, 106, 0.12);
  color: var(--d2r-gold);
}

.sidebar-link.router-link-active {
  background: rgba(201, 163, 106, 0.2);
  color: var(--d2r-gold);
  border-color: rgba(201, 163, 106, 0.4);
}

.sidebar-footer {
  padding: 0 1.25rem 1.5rem;
  color: rgba(194, 176, 143, 0.7);
  font-size: 0.85rem;
  line-height: 1.4;
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
