import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupPageApp } from './PopupPageApp';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <PopupPageApp />
  </StrictMode>
);
