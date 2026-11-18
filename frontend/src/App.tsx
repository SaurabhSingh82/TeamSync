import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'

const InvitationAcceptPage = lazy(() => import('./pages/InvitationAcceptPage').then((module) => ({ default: module.InvitationAcceptPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((module) => ({ default: module.CalendarPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })))
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const ProjectLayout = lazy(() => import('./components/projects/ProjectLayout').then((module) => ({ default: module.ProjectLayout })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const ProjectMembersPage = lazy(() => import('./pages/ProjectMembersPage').then((module) => ({ default: module.ProjectMembersPage })))
const ProjectOverviewPage = lazy(() => import('./pages/ProjectOverviewPage').then((module) => ({ default: module.ProjectOverviewPage })))
const ProjectSettingsPage = lazy(() => import('./pages/ProjectSettingsPage').then((module) => ({ default: module.ProjectSettingsPage })))
const ProjectTasksPage = lazy(() => import('./pages/ProjectTasksPage').then((module) => ({ default: module.ProjectTasksPage })))
const TaskDetailDrawer = lazy(() => import('./pages/TaskDetailDrawer').then((module) => ({ default: module.TaskDetailDrawer })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })))
const WorkspaceCreatePage = lazy(() => import('./pages/WorkspaceCreatePage').then((module) => ({ default: module.WorkspaceCreatePage })))
const WorkspaceMembersPage = lazy(() => import('./pages/WorkspaceMembersPage').then((module) => ({ default: module.WorkspaceMembersPage })))
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage').then((module) => ({ default: module.WorkspaceSettingsPage })))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })))
const InvitationsPage = lazy(() => import('./pages/InvitationsPage').then((module) => ({ default: module.InvitationsPage })))
const WorkspaceActivityPage = lazy(() => import('./pages/WorkspaceActivityPage').then((module) => ({ default: module.WorkspaceActivityPage })))
const SearchPage = lazy(() => import('./pages/SearchPage').then((module) => ({ default: module.SearchPage })))

function App() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-600" role="status">Loading page…</p>}>
      <Routes>
        <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="calendar"
          element={
            <RequireAuth>
              <CalendarPage />
            </RequireAuth>
          }
        />
        <Route
          path="analytics"
          element={
            <RequireAuth>
              <AnalyticsPage />
            </RequireAuth>
          }
        />
        <Route
          path="search"
          element={
            <RequireAuth>
              <SearchPage />
            </RequireAuth>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="invitations/accept" element={<InvitationAcceptPage />} />
        <Route
          path="notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="invitations"
          element={
            <RequireAuth>
              <InvitationsPage />
            </RequireAuth>
          }
        />
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
          path="workspaces/:workspaceId/activity"
          element={
            <RequireAuth>
              <WorkspaceActivityPage />
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
          <Route path="tasks" element={<ProjectTasksPage />}>
            <Route path=":taskId" element={<TaskDetailDrawer />} />
          </Route>
          <Route path="members" element={<ProjectMembersPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
