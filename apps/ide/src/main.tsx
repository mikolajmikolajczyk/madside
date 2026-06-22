import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ui/index.css'
import App from '@ui/App'
import { WorkbenchProvider } from '@app'
import { Boundary } from './ui/components/ui/Boundary'
import { ToastProvider } from './ui/components/ui/Toast'
import { DockSpike } from './ui/dock/DockSpike'

// Dockview layout spike behind a flag (VITE_MADSIDE_DOCKVIEW=1). Off by default
// → the real App renders untouched.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary level="root">
      <WorkbenchProvider>
        <ToastProvider>
          {import.meta.env.VITE_MADSIDE_DOCKVIEW ? <DockSpike /> : <App />}
        </ToastProvider>
      </WorkbenchProvider>
    </Boundary>
  </StrictMode>,
)
