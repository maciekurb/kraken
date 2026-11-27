import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initGlobalLogCapture, logger } from './debug/logger';
import { I18nProvider } from './i18n/I18nContext';
import './styles/theme.css';
import './styles/global.css';

// Initialize global diagnostic logging before rendering or SW registration
initGlobalLogCapture();

// Register PWA service worker for offline caching & auto-updates
registerSW({
  immediate: true,
  onNeedRefresh() {
    logger.info('APP', 'PWA service worker: new version available (onNeedRefresh)');
  },
  onOfflineReady() {
    logger.info('APP', 'PWA service worker: offline cache ready (onOfflineReady)');
  },
  onRegisteredSW(swUrl, registration) {
    logger.info('APP', 'PWA service worker registered', {
      swUrl,
      scope: registration?.scope,
      activeState: registration?.active?.state,
    });
  },
  onRegisterError(error) {
    logger.error('APP', 'PWA service worker registration failed', error);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
