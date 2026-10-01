import React, { useEffect, useState } from 'react'
import { useWorkspaceStore } from './stores/workspaceStore'
import { ProjectCard } from './components/ProjectCard'
import type { Project } from './types'

function App() {
  const { workspace, addProject, updateProject, deleteProject, loadFromLocalStorage, saveToLocalStorage } = useWorkspaceStore()
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    client: '',
  })

  // Load from localStorage on mount
  useEffect(() => {
    loadFromLocalStorage()
  }, [loadFromLocalStorage])

  // Save to localStorage whenever workspace changes
  useEffect(() => {
    if (workspace.projects.length > 0 || workspace.people.length > 0) {
      saveToLocalStorage()
    }
  }, [workspace, saveToLocalStorage])

  const handleAddProject = () => {
    if (!formData.code || !formData.name || !formData.client) {
      alert('Wypełnij wszystkie pola')
      return
    }

    if (editingProject) {
      updateProject(editingProject.id, {
        code: formData.code,
        name: formData.name,
        client: formData.client,
      })
      setEditingProject(null)
    } else {
      const newProject: Project = {
        id: Math.max(0, ...workspace.projects.map(p => p.id)) + 1,
        code: formData.code,
        name: formData.name,
        client: formData.client,
        status: 'planned',
        manager: '',
        members: [],
        stages: [],
        createdAt: new Date().toISOString(),
      }
      addProject(newProject)
    }

    setFormData({ code: '', name: '', client: '' })
    setShowForm(false)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setFormData({
      code: project.code,
      name: project.name,
      client: project.client,
    })
    setShowForm(true)
  }

  const handleDeleteProject = (id: number) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten projekt?')) {
      deleteProject(id)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">ETROM v2</h1>
              <p className="text-gray-600 mt-1">Zarządzanie Projektami</p>
            </div>
            <button
              onClick={() => {
                setShowForm(!showForm)
                setEditingProject(null)
                setFormData({ code: '', name: '', client: '' })
              }}
              className="btn-primary"
            >
              + Nowy Projekt
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Form Section */}
        {showForm && (
          <div className="card mb-8 border-l-4 border-blue-600">
            <h2 className="text-xl font-semibold mb-4">
              {editingProject ? 'Edytuj Projekt' : 'Nowy Projekt'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kod projektu
                </label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="np. PROJ-001"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nazwa projektu
                </label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="np. Nowa aplikacja webowa"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Klient
                </label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="np. Acme Corp"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowForm(false)
                    setEditingProject(null)
                    setFormData({ code: '', name: '', client: '' })
                  }}
                  className="btn-secondary"
                >
                  Anuluj
                </button>
                <button onClick={handleAddProject} className="btn-primary">
                  {editingProject ? 'Zaktualizuj' : 'Dodaj Projekt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {workspace.projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-600">Brak projektów. Dodaj nowy projekt, aby zacząć!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspace.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleEditProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-600">
          <p>ETROM v2 — React + TypeScript + Tailwind CSS</p>
          <p className="mt-1">📊 Wszystkie projekty: <strong>{workspace.projects.length}</strong></p>
        </div>
      </footer>
    </div>
  )
}

export default App
