import { defineStore } from 'pinia'

export const useChessStore = defineStore('chess', {
  state: () => ({
    units: [],
    factions: [
      { id: 'earth', name: '地球联邦', color: '#3b82f6' },
      { id: 'byron', name: '拜伦帝国', color: '#ef4444' },
      { id: 'maxion', name: '马克辛共和国', color: '#10b981' }
    ],
    skills: [],
    tags: ['output', 'burst', 'aoe', 'control', 'support', 'tank', 'speed', 'defense'],
    loading: false,
    error: null
  }),
  
  getters: {
    unitsByFaction: (state) => (factionId) => {
      return state.units.filter(u => u.faction === factionId)
    }
  },
  
  actions: {
    async fetchUnits() {
      this.loading = true
      try {
        // TODO: 连接 API
        this.units = []
      } finally {
        this.loading = false
      }
    },
    
    async createUnit(data) {
      // TODO: 连接 API
      console.log('Creating unit:', data)
      return { id: Date.now(), ...data }
    },
    
    async exportUnitToJSON(id) {
      const unit = this.units.find(u => u.id === id)
      if (!unit) throw new Error('Unit not found')
      
      const jsonString = JSON.stringify(unit, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chess_${unit.name}_${id}.json`
      a.click()
    }
  }
})
