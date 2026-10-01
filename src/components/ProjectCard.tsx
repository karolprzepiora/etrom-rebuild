import React from 'react'
import type { Project } from '../types'

interface ProjectCardProps {
  project: Project
  onEdit: (project: Project) => void
  onDelete: (id: number) => void
}

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  done: 'bg-blue-100 text-blue-800'
}

const statusLabels: Record<string, string> = {
  planned: 'Planowanie',
  active: 'Aktywny',
  paused: 'Wstrzymany',
  done: 'Zakończony'
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onEdit, onDelete }) => {
  const completedStages = project.stages?.filter(s => s.status === 'done').length || 0
  const totalStages = project.stages?.length || 0
  const progressPercent = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

  return (
    <div className="card hover:shadow-md transition cursor-pointer" onClick={() => onEdit(project)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[project.status]}`}>
              {statusLabels[project.status]}
            </span>
          </div>
          <p className="text-sm text-gray-500">{project.code}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(project.id)
          }}
          className="text-gray-400 hover:text-red-600 transition"
          title="Usuń projekt"
        >
          ✕
        </button>
      </div>

      {/* Client */}
      <p className="text-sm text-gray-600 mb-3">
        <span className="font-medium">Klient:</span> {project.client}
      </p>

      {/* Progress Bar */}
      {totalStages > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Postęp</span>
            <span>{completedStages}/{totalStages} etapów</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Team Preview */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-600">Zespół:</span>
        <div className="flex -space-x-2">
          {project.members?.slice(0, 3).map((member, i) => (
            <div
              key={i}
              className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
              title={member}
            >
              {member.charAt(0).toUpperCase()}
            </div>
          ))}
          {(project.members?.length || 0) > 3 && (
            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-bold text-gray-700">
              +{(project.members?.length || 0) - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
