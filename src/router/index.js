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
    path: '/items/affixes',
    name: 'Affixes',
    component: () => import('../views/AffixesView.vue')
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
  },
  {
    path: '/drop-calc',
    name: 'DropCalc',
    component: () => import('../views/DropCalcView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

export default router
