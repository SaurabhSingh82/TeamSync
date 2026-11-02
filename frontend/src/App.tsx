import { Navigate, Route, Routes } from 'react-router'

import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import { InvitationAcceptPage } from './pages/InvitationAcceptPage'
import { DashboardPlaceholderPage } from './pages/DashboardPlaceholderPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProjectLayout } from './components/projects/ProjectLayout'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectMembersPage } from './pages/ProjectMembersPage'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { ProjectTaskListPage } from './pages/ProjectTaskListPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { WorkspaceCreatePage } from './pages/WorkspaceCreatePage'
import { WorkspaceMembersPage } from './pages/WorkspaceMembersPage'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPlaceholderPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="invitations/accept" element={<InvitationAcceptPage />} />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="workspaces/new"
          element={
            <RequireAuth>
              <WorkspaceCreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="workspaces/:workspaceId"
          element={
            <RequireAuth>
              <WorkspaceSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="workspaces/:workspaceId/members"
          element={
            <RequireAuth>
              <WorkspaceMembersPage />
            </RequireAuth>
          }
        />
        <Route
          path="workspaces/:workspaceId/projects"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="workspaces/:workspaceId/projects/:projectId"
          element={
            <RequireAuth>
              <ProjectLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ProjectOverviewPage />} />
          <Route path="tasks" element={<ProjectTaskListPage />} />
          <Route path="tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="members" element={<ProjectMembersPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
