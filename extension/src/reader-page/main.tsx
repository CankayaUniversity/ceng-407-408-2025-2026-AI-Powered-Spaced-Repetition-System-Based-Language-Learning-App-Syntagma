import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReaderApp } from './ReaderApp';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <ReaderApp />
  </StrictMode>
);
