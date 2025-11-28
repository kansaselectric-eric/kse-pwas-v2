import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const savedMode = (localStorage.getItem('kse_mode') as 'ops' | 'executive') || 'ops'
document.documentElement.dataset.mode = savedMode

const root = createRoot(document.getElementById('root')!)
root.render(<React.StrictMode><App /></React.StrictMode>)




