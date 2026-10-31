import { Navigate, Route, Routes } from 'react-router'

import { AppLayout } from './components/layout/AppLayout'
import { DashboardPlaceholderPage } from './pages/DashboardPlaceholderPage'
import { HomePage } from './pages/HomePage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPlaceholderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
