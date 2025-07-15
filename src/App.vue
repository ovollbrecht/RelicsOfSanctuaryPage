<script setup>
import { ref } from 'vue'

const isItemsExpanded = ref(false)

const toggleItems = () => {
  isItemsExpanded.value = !isItemsExpanded.value
}
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="logo-container">
        <img alt="RS logo" class="logo" src="./assets/RelicsOfSancturay-logo.png" width="50" height="50" />
        <h1>Relics Of Sanctuary</h1>
      </div>

      <nav class="nav-menu">
        <ul>
          <li class="nav-item">
            <router-link to="/" class="nav-link">Home</router-link>
          </li>
          <li class="nav-item">
            <div class="nav-link with-submenu" @click="toggleItems">
              Items
              <span class="toggle-icon">{{ isItemsExpanded ? '▼' : '▶' }}</span>
            </div>
            <ul class="submenu" v-if="isItemsExpanded">
              <li class="submenu-item">
                <router-link to="/items/uniques" class="submenu-link">Uniques</router-link>
              </li>
<!--              <li class="submenu-item">-->
<!--                <router-link to="/items/cube" class="submenu-link">Cube</router-link>-->
<!--              </li>-->
            </ul>
          </li>
        </ul>
      </nav>
    </aside>

    <main class="content">
      <div class="content-container">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 250px;
  background-color: var(--vt-c-indigo);
  color: var(--vt-c-white);
  padding: 1rem;
}

@media (prefers-color-scheme: dark) {
  .sidebar {
    background-color: var(--vt-c-black-soft);
  }
}

.logo-container {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.logo {
  margin-right: 1rem;
}

h1 {
  font-size: 1.2rem;
  margin: 0;
}

.nav-menu {
  margin-top: 2rem;
}

.nav-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  margin-bottom: 0.5rem;
}

.nav-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  color: var(--vt-c-white);
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.with-submenu {
  cursor: pointer;
}

.toggle-icon {
  font-size: 0.8rem;
}

.submenu {
  margin-top: 0.5rem;
  margin-left: 1rem;
}

.submenu-item {
  margin-bottom: 0.3rem;
}

.submenu-link {
  display: block;
  padding: 0.5rem 1rem;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.submenu-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.content {
  flex: 1;
  padding: 2rem;
  background-color: var(--color-background);
  color: var(--color-text);
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
