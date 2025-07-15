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
  }
]

const baseUrl = import.meta.env.MODE === 'production' ? '/RelicsOfSanctuaryPage/' : '/'

const router = createRouter({
  history: createWebHashHistory(baseUrl),
  routes
})

export default router
