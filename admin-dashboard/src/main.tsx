import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AdminAuthProvider } from './providers/AdminAuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
