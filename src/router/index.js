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
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

export default router
