import './migrateStorage'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { preloadWorkspace } from './bootWorkspace'
import { applyTheme, loadTheme } from './theme'
import 'reactflow/dist/style.css'
import './index.css'

// Before the first paint, so the page never flashes the other appearance.
applyTheme(loadTheme())

// The workspace lives in IndexedDB, which reads asynchronously; the store
// takes it from there when its module loads, so the app is loaded after.
preloadWorkspace().then(() => import('./App')).then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
