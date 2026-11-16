import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import { Badgeuse } from './pages/Badgeuse.tsx'
import { Home } from './pages/Home.tsx'
import { Kiosk } from './pages/Kiosk.tsx'
import { Login } from './pages/Login.tsx'
import { Planning } from './pages/Planning.tsx'
import { Profile } from './pages/Profile.tsx'
import { Requests } from './pages/Requests.tsx'

// One route per screen. /kiosk is the shared tablet; the rest needs a login.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sites/:siteId/planning" element={<Planning />} />
        <Route path="/sites/:siteId/badgeuse" element={<Badgeuse />} />
        <Route path="/demandes" element={<Requests />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/kiosk" element={<Kiosk />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
