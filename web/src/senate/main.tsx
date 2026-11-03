import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import SenateApp from './SenateApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SenateApp />
  </StrictMode>,
)
