import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ui/index.css'
import App from '@ui/App'
import { WorkbenchProvider } from '@app'
import { Boundary } from './ui/components/ui/Boundary'
import { ToastProvider } from './ui/components/ui/Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary level="root">
      <WorkbenchProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </WorkbenchProvider>
    </Boundary>
  </StrictMode>,
)
