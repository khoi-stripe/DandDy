import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import CharacterList from './pages/CharacterList'
import CharacterSheet from './pages/CharacterSheet'
import CharacterCreation from './pages/CharacterCreation'
import CampaignList from './pages/CampaignList'
import CampaignDetail from './pages/CampaignDetail'
import Profile from './pages/Profile'
import Layout from './components/Layout'
import UsersPage from './pages/UsersPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />
}

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage />} />
        
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="characters" element={<CharacterList />} />
          <Route path="characters/new" element={<CharacterCreation />} />
          <Route path="characters/:id" element={<CharacterSheet />} />
          <Route path="campaigns" element={<CampaignList />} />
          <Route path="campaigns/:id" element={<CampaignDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

