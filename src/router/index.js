import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue')
  },
  {
    path: '/items/uniques',
    name: 'Uniques',
    component: () => import('../views/UniquesView.vue')
  },
  {
    path: '/items/cube',
    name: 'Cube',
    component: () => import('../views/CubeView.vue')
  },
  {
    path: '/runewords',
    name: 'Runewords',
    component: () => import('../views/RunewordsView.vue')
  },
  {
    path: '/items/crafting',
    name: 'Crafting',
    component: () => import('../views/CraftingView.vue')
  },
  {
    path: '/items/sets',
    name: 'Sets',
    component: () => import('../views/SetsView.vue')
  },
  {
    path: '/items/mythic-affixes',
    name: 'MythicAffixes',
    component: () => import('../views/MythicAffixesView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

export default router
