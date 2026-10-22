import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './editor.css';
import './midnight-workspace.css';
import { watchSystemTheme } from './theme';
import { registerServiceWorker } from './reminders-service';

watchSystemTheme();
registerServiceWorker().catch((err) => console.warn('SW registration:', err));
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
