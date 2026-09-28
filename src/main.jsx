import './migrateStorage'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'reactflow/dist/style.css'
import './index.css'
import { applyTheme, loadTheme } from './theme'

// Before the first paint, so the page never flashes the other appearance.
applyTheme(loadTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
