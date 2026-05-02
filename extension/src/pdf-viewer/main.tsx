import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PDFViewerApp from './PDFViewerApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PDFViewerApp />
  </StrictMode>
);
