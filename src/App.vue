<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isItemsExpanded = ref(false)
const isSidebarOpen = ref(false)
const isWideScreen = ref(false)
const windowWidth = ref(0)

// Safely check if window exists (for SSR compatibility)
const updateWindowWidth = () => {
  if (typeof window !== 'undefined') {
    windowWidth.value = window.innerWidth
    isWideScreen.value = windowWidth.value > 768
  }
}

// Initialize on client-side only
onMounted(() => {
  updateWindowWidth()
  isSidebarOpen.value = isWideScreen.value

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateWindowWidth)
    window.addEventListener('click', handleClickOutside)
  }
})

// Clean up event listeners
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateWindowWidth)
    window.removeEventListener('click', handleClickOutside)
  }
})

const toggleItems = () => {
  isItemsExpanded.value = !isItemsExpanded.value
}

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// Close sidebar when clicking outside on mobile
const handleClickOutside = (event) => {
  if (!isWideScreen.value && isSidebarOpen.value && !event.target.closest('.sidebar') && !event.target.closest('.hamburger-menu')) {
    isSidebarOpen.value = false
  }
}

// Watch for window resize to auto-open sidebar on large screens
const checkScreenSize = () => {
  if (isWideScreen.value) {
    isSidebarOpen.value = true
  }
}
</script>

<template>
  <div class="container-fluid p-0">
    <div class="row g-0">
      <!-- Hamburger Menu Button for Mobile -->
      <button class="btn hamburger-menu d-md-none position-fixed top-0 start-0 mt-3 ms-3 z-3"
              @click="toggleSidebar"
              style="width: 40px; height: 40px;">
        <span class="navbar-toggler-icon"></span>
      </button>

      <!-- Sidebar -->
      <div class="col-md-3 col-lg-2 d-md-block sidebar"
           :class="{ 'show': isSidebarOpen }"
           style="height: 100vh; overflow-y: auto;">
        <div class="sidebar-header d-flex justify-content-between align-items-center p-3">
          <div class="d-flex align-items-center">
            <h5 class="mb-0 text-warning">Relics Of Sanctuary</h5>
          </div>
          <button class="btn-close btn-close-white d-md-none" @click="toggleSidebar"></button>
        </div>

        <div class="p-3">
          <ul class="nav flex-column">
            <li class="nav-item">
              <router-link to="/" class="nav-link sidebar-link" @click="!isWideScreen && (isSidebarOpen = false)">Home</router-link>
            </li>
            <li class="nav-item">
              <div class="nav-link sidebar-link d-flex justify-content-between align-items-center"
                   @click="toggleItems"
                   style="cursor: pointer;">
                Items
                <span class="ms-2">{{ isItemsExpanded ? '▼' : '▶' }}</span>
              </div>
              <div v-if="isItemsExpanded" class="ms-3">
                <ul class="nav flex-column">
                  <li class="nav-item">
                    <router-link to="/items/uniques" class="nav-link sidebar-sublink" @click="!isWideScreen && (isSidebarOpen = false)">Uniques</router-link>
                  </li>
                  <!-- <li class="nav-item">
                    <router-link to="/items/cube" class="nav-link sidebar-sublink" @click="!isWideScreen && (isSidebarOpen = false)">Cube</router-link>
                  </li> -->
                </ul>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Overlay for mobile -->
      <div class="overlay position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50"
           v-if="isSidebarOpen && !isWideScreen"
           @click="toggleSidebar"
           style="z-index: 1;"></div>

      <!-- Main Content -->
      <div class="col-md-9 col-lg-10 ms-sm-auto px-md-4">
        <div class="container-fluid py-4">
          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom styles to complement Bootstrap */
.sidebar {
  transform: translateX(-100%);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2;
  background-color: var(--d2r-bg);
  color: var(--d2r-text);
  border-right: 1px solid var(--d2r-border);
}

@media (min-width: 768px) {
  .sidebar {
    transform: translateX(0);
    position: sticky;
    top: 0;
    height: 100vh;
  }
}

.sidebar.show {
  transform: translateX(0);
}

.sidebar-header {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  border-bottom: 1px solid var(--d2r-border);
}

.sidebar-link {
  color: var(--d2r-text) !important;
}

.sidebar-sublink {
  color: #aaa !important;
}

.hamburger-menu {
  background-color: var(--d2r-bg-soft);
  border: 1px solid var(--d2r-border);
  color: var(--d2r-gold);
}

.hamburger-menu:hover {
  background-color: var(--d2r-bg);
  color: var(--d2r-highlight);
}

.hamburger-menu .navbar-toggler-icon {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28198, 156, 109, 0.8%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}
</style>
