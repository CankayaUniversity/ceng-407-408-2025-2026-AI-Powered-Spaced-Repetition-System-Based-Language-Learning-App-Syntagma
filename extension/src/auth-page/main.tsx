import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthApp } from './AuthApp';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <AuthApp />
  </StrictMode>
);
