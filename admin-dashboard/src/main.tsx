import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Sentry } from './lib/sentry';
import App from './App';
import { AdminAuthProvider } from './providers/AdminAuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: 16 }}>Something went wrong. Please refresh.</div>}>
      <ThemeProvider>
        <BrowserRouter>
          <AdminAuthProvider>
            <App />
          </AdminAuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
