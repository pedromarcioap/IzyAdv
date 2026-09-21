import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './lib/auth/AuthContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The provider owns the session lifecycle for the whole tree, so a route
        guard and the public page read the same verified state. */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
