// Import Bootstrap CSS and JS
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

// Import custom CSS after Bootstrap
import './assets/main.css'
import '@/assets/d2r-theme.css'


import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'

createApp(App)
  .use(router)
  .use(i18n)
  .mount('#app')
