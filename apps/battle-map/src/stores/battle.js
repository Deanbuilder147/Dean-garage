import { defineStore } from 'pinia'
import axios from 'axios'

const mapApi = axios.create({
  baseURL: '/api/map',
  headers: {
    'Content-Type': 'application/json'
  }
})

const combatApi = axios.create({
  baseURL: '/api/combat',
  headers: {
    'Content-Type': 'application/json'
  }
})

// 添加请求拦截器
const addAuth = (config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

mapApi.interceptors.request.use(addAuth)
combatApi.interceptors.request.use(addAuth)

export const useBattlefieldStore = defineStore('battlefield', {
  state: () => ({
    battlefields: [],
    currentBattlefield: null,
    terrainTypes: [],
    loading: false,
    error: null
  }),

  getters: {
    getBattlefieldById: (state) => (id) => {
      return state.battlefields.find(bf => bf.id === id)
    }
  },

  actions: {
    async fetchBattlefields() {
      this.loading = true
      this.error = null
      try {
        const response = await mapApi.get('/battlefields')
        this.battlefields = response.data
        return response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch battlefields:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchBattlefield(id) {
      this.loading = true
      this.error = null
      try {
        const response = await mapApi.get(`/battlefields/${id}`)
        this.currentBattlefield = response.data
        return response.data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async createBattlefield(battlefieldData) {
      this.loading = true
      this.error = null
      try {
        const response = await mapApi.post('/battlefields', battlefieldData)
        this.battlefields.push(response.data)
        return response.data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async updateBattlefield(id, battlefieldData) {
      this.loading = true
      this.error = null
      try {
        const response = await mapApi.put(`/battlefields/${id}`, battlefieldData)
        const index = this.battlefields.findIndex(bf => bf.id === id)
        if (index !== -1) {
          this.battlefields[index] = response.data
        }
        return response.data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async deleteBattlefield(id) {
      this.loading = true
      this.error = null
      try {
        await mapApi.delete(`/battlefields/${id}`)
        this.battlefields = this.battlefields.filter(bf => bf.id !== id)
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchTerrainTypes() {
      try {
        const response = await mapApi.get('/battlefields/terrain/types')
        this.terrainTypes = response.data
        return response.data
      } catch (error) {
        console.error('Failed to fetch terrain types:', error)
        throw error
      }
    },

    async exportBattlefieldToJSON(id) {
      try {
        const battlefield = await this.fetchBattlefield(id)
        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          battlefield: {
            id: battlefield.id,
            name: battlefield.name,
            width: battlefield.width,
            height: battlefield.height,
            cells: battlefield.cells ? JSON.parse(battlefield.cells) : [],
            is_public: battlefield.is_public,
            created_at: battlefield.created_at
          }
        }
        
        const jsonString = JSON.stringify(exportData, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `battlefield_${battlefield.name}_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        return exportData
      } catch (error) {
        console.error('Failed to export battlefield:', error)
        throw error
      }
    }
  }
})

export const useBattleStore = defineStore('battle', {
  state: () => ({
    battles: [],
    currentBattle: null,
    ws: null,
    loading: false,
    error: null
  }),

  actions: {
    async fetchBattles() {
      this.loading = true
      try {
        const response = await combatApi.get('/battles')
        this.battles = response.data
        return response.data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async createBattle(battleData) {
      this.loading = true
      try {
        const response = await combatApi.post('/battles', battleData)
        this.battles.push(response.data)
        return response.data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    connectWebSocket(battleId) {
      const wsUrl = `ws://localhost:3004?battleId=${battleId}`
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected')
      }
      
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        // Handle WebSocket messages
        console.log('WS Message:', data)
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      this.ws.onclose = () => {
        console.log('WebSocket closed')
        this.ws = null
      }
    },

    disconnectWebSocket() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
    },

    async exportBattleToJSON(battleId) {
      try {
        const response = await combatApi.get(`/battles/${battleId}`)
        const battle = response.data
        
        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          battle: {
            id: battle.id,
            battlefield_id: battle.battlefield_id,
            units: battle.units ? JSON.parse(battle.units) : [],
            state: battle.state ? JSON.parse(battle.state) : null,
            turn: battle.turn,
            status: battle.status,
            created_at: battle.created_at
          }
        }
        
        const jsonString = JSON.stringify(exportData, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `battle_${battleId}_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        return exportData
      } catch (error) {
        console.error('Failed to export battle:', error)
        throw error
      }
    }
  }
})
