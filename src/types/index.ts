export type ProjectStatus = 'planned' | 'active' | 'paused' | 'done'
export type StageStatus = 'todo' | 'working' | 'done'
export type TaskStatus = 'todo' | 'working' | 'review' | 'changes' | 'approved' | 'done'
export type UserRole = 'admin' | 'manager' | 'collaborator'

export interface Stage {
  id: string
  name: string
  domain: string // 'general', 'design', 'environment', 'water', 'location', 'building'
  status: StageStatus
  hours: number
  weight: number
  date: string // YYYY-MM-DD
  startDate?: string
  members: string[]
  tasks: Task[]
  completion?: number
}

export interface Task {
  id: string
  name: string
  status: TaskStatus
  date: string // deadline
  description?: string
  assignees: string[]
  workload?: 'small' | 'medium' | 'large' | 'veryLarge'
  important?: boolean
  hardDeadline?: boolean
  steps: Step[]
}

export interface Step {
  id: string
  name: string
  assignee: string
  status: TaskStatus
  date: string
  workload?: 'small' | 'medium' | 'large' | 'veryLarge'
}

export interface Project {
  id: number
  code: string
  name: string
  client: string
  status: ProjectStatus
  manager: string
  members: string[]
  stages: Stage[]
  createdAt?: string
  updatedAt?: string
}

export interface Person {
  id: string
  firstName: string
  lastName: string
  email?: string
  role: UserRole
  position?: string
  avatar?: string
  active: boolean
}

export interface Workspace {
  version: number
  projects: Project[]
  people: Person[]
  timeTracking?: Record<string, unknown>
  settings?: Record<string, unknown>
}
