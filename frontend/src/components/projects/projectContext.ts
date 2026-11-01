import { useOutletContext } from 'react-router'
import type { Dispatch, SetStateAction } from 'react'

import type { Project, ProjectMember } from '../../projects/types'

export interface ProjectOutletContext {
  project: Project
  members: ProjectMember[]
  memberCount: number
  setProject: Dispatch<SetStateAction<Project | null>>
  refresh: () => Promise<void>
}

export function useProjectContext() {
  return useOutletContext<ProjectOutletContext>()
}
