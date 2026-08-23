import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SettingsPage from './SettingsPage.jsx'
import BuildPage from './BuildPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        {/* Opened in its own browser tab from the board's gear icon (see
            TopBar in WebsterGrovesChemistry.jsx) — a real, bookmarkable
            /settings URL rather than an in-app modal, so a teacher can
            flip between the live board and settings side by side. */}
        <Route path="/settings" element={<SettingsPage />} />
        {/* Opened in its own browser tab from the board's 🛠 icon — where
            content (assignments, calendar, eventually units/lessons/
            slides) is actually added and edited. Deliberately never
            inline on the board itself, which can be projected in class
            and should show zero add/edit affordances. See BuildPage.jsx. */}
        <Route path="/build" element={<BuildPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
