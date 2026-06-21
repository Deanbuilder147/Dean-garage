import { defineStore } from 'pinia'
import axios from 'axios'

const api = axios.create({
  baseURL: '/api/hangar',
  headers: {
    'Content-Type': 'application/json'
  }
})

// 添加请求拦截器 - 自动附加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const useUnitStore = defineStore('unit', {
  state: () => ({
    units: [],
    currentUnit: null,
    loading: false,
    error: null,
    unitTypes: []
  }),

  getters: {
    getUnitById: (state) => (id) => {
      return state.units.find(unit => unit.id === id)
    },
    getUnitsByFaction: (state) => (faction) => {
      return state.units.filter(unit => unit.faction === faction)
    }
  },

  actions: {
    async fetchUnits() {
      this.loading = true
      this.error = null
      try {
        const response = await api.get('/units')
        this.units = response.data
        return response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch units:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchUnit(id) {
      this.loading = true
      this.error = null
      try {
        const response = await api.get(`/units/${id}`)
        this.currentUnit = response.data
        return response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to fetch unit:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async createUnit(unitData) {
      this.loading = true
      this.error = null
      try {
        const response = await api.post('/units', unitData)
        this.units.push(response.data)
        return response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to create unit:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async updateUnit(id, unitData) {
      this.loading = true
      this.error = null
      try {
        const response = await api.put(`/units/${id}`, unitData)
        const index = this.units.findIndex(u => u.id === id)
        if (index !== -1) {
          this.units[index] = response.data
        }
        return response.data
      } catch (error) {
        this.error = error.message
        console.error('Failed to update unit:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async deleteUnit(id) {
      this.loading = true
      this.error = null
      try {
        await api.delete(`/units/${id}`)
        this.units = this.units.filter(u => u.id !== id)
      } catch (error) {
        this.error = error.message
        console.error('Failed to delete unit:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchUnitTypes() {
      try {
        const response = await api.get('/units/unit-types')
        this.unitTypes = response.data
        return response.data
      } catch (error) {
        console.error('Failed to fetch unit types:', error)
        throw error
      }
    },

    async uploadImage(file) {
      const formData = new FormData()
      formData.append('image', file)
      
      try {
        const response = await api.post('/units/upload-image', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        return response.data
      } catch (error) {
        console.error('Failed to upload image:', error)
        throw error
      }
    },

    async importExcel(file) {
      const formData = new FormData()
      formData.append('file', file)
      
      try {
        const response = await api.post('/units/import-excel', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        // 刷新棋子列表
        await this.fetchUnits()
        return response.data
      } catch (error) {
        console.error('Failed to import excel:', error)
        throw error
      }
    }
  }
})
