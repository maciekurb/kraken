import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { I18nProvider } from './i18n/I18nContext';
import './styles/theme.css';
import './styles/global.css';

// Register PWA service worker for offline caching & auto-updates
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
