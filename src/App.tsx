import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ConfigPage from './pages/ConfigPage'
import ValidationPage from './pages/ValidationPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Page de connexion — accessible sans auth */}
          <Route path="/login" element={<LoginPage />} />

          {/* Pages protégées — enveloppées dans Layout (nav + outlet) */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/validation" replace />} />
            <Route path="/config"     element={<ConfigPage />} />
            <Route path="/validation" element={<ValidationPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
