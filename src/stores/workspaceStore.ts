import { create } from 'zustand'
import type { Workspace, Project, Person } from '../types'

interface WorkspaceStore {
  workspace: Workspace
  setWorkspace: (workspace: Workspace) => void
  addProject: (project: Project) => void
  updateProject: (id: number, project: Partial<Project>) => void
  deleteProject: (id: number) => void
  addPerson: (person: Person) => void
  updatePerson: (id: string, person: Partial<Person>) => void
  deletePerson: (id: string) => void
  saveToLocalStorage: () => void
  loadFromLocalStorage: () => void
}

const STORAGE_KEY = 'etrom.workspace.v2'

const defaultWorkspace: Workspace = {
  version: 2,
  projects: [],
  people: [],
  timeTracking: {},
  settings: {}
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspace: defaultWorkspace,

  setWorkspace: (workspace) => set({ workspace }),

  addProject: (project) => set((state) => ({
    workspace: {
      ...state.workspace,
      projects: [...state.workspace.projects, project]
    }
  })),

  updateProject: (id, updates) => set((state) => ({
    workspace: {
      ...state.workspace,
      projects: state.workspace.projects.map(p =>
        p.id === id ? { ...p, ...updates } : p
      )
    }
  })),

  deleteProject: (id) => set((state) => ({
    workspace: {
      ...state.workspace,
      projects: state.workspace.projects.filter(p => p.id !== id)
    }
  })),

  addPerson: (person) => set((state) => ({
    workspace: {
      ...state.workspace,
      people: [...state.workspace.people, person]
    }
  })),

  updatePerson: (id, updates) => set((state) => ({
    workspace: {
      ...state.workspace,
      people: state.workspace.people.map(p =>
        p.id === id ? { ...p, ...updates } : p
      )
    }
  })),

  deletePerson: (id) => set((state) => ({
    workspace: {
      ...state.workspace,
      people: state.workspace.people.filter(p => p.id !== id)
    }
  })),

  saveToLocalStorage: () => {
    const { workspace } = get()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
      console.log('✅ Workspace saved to localStorage')
    } catch (error) {
      console.error('Failed to save workspace:', error)
    }
  },

  loadFromLocalStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const workspace = JSON.parse(saved)
        set({ workspace })
        console.log('✅ Workspace loaded from localStorage')
      }
    } catch (error) {
      console.error('Failed to load workspace:', error)
    }
  }
}))
