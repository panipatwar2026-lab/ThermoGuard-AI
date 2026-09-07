import { Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import AnalyzePage from './pages/AnalyzePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/analyze" element={<AnalyzePage />} />
    </Routes>
  )
}
