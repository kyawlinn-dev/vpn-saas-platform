import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminAuthProvider } from './providers/AdminAuthProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  </React.StrictMode>,
);
