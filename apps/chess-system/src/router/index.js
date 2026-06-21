import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ChessListView from '../views/ChessListView.vue'
import ChessEditorView from '../views/ChessEditorView.vue'
import ChessImportView from '../views/ChessImportView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/chess-units',
    name: 'ChessList',
    component: ChessListView
  },
  {
    path: '/chess-units/new',
    name: 'ChessNew',
    component: ChessEditorView
  },
  {
    path: '/chess-units/:id',
    name: 'ChessEdit',
    component: ChessEditorView
  },
  {
    path: '/chess-units/import',
    name: 'ChessImport',
    component: ChessImportView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
