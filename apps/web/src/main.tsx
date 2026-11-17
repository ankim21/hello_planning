import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import { Leave } from './me/Leave.tsx'
import { MyProfile } from './me/MyProfile.tsx'
import { MyWeek } from './me/MyWeek.tsx'
import { Restaurant } from './me/Restaurant.tsx'
import { Badgeuse } from './pages/Badgeuse.tsx'
import { Home } from './pages/Home.tsx'
import { Kiosk } from './pages/Kiosk.tsx'
import { Login } from './pages/Login.tsx'
import { Planning } from './pages/Planning.tsx'
import { Requests } from './pages/Requests.tsx'

// Two spaces behind one login:
//   /moi/...    "Mon espace", the personal side, for everyone who works shifts;
//   /sites/...  the management screens, for people with a role.
// /kiosk is the shared tablet and needs no login.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route path="/moi" element={<MyWeek />} />
        <Route path="/moi/restaurant" element={<Restaurant />} />
        <Route path="/moi/restaurant/:siteId" element={<Restaurant />} />
        <Route path="/moi/conges" element={<Leave />} />
        <Route path="/moi/profil" element={<MyProfile />} />
        <Route path="/profil" element={<Navigate to="/moi/profil" replace />} />

        <Route path="/sites/:siteId/planning" element={<Planning />} />
        <Route path="/sites/:siteId/badgeuse" element={<Badgeuse />} />
        <Route path="/demandes" element={<Requests />} />

        <Route path="/kiosk" element={<Kiosk />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
