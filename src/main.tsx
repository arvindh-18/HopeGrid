// src/main.tsx — render app, register PWA (app shell offline), start the offline outbox.
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { isNativeApp } from './lib/serverUrl';
import * as outbox from './offline/outbox';

// The Android app already has every file on the phone, so the offline service worker is only for the website.
if (!isNativeApp()) registerSW({ immediate: true });
outbox.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
