import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/bricolage-grotesque';
import './index.css';
import App from './App.jsx';
import UpdateNotice from './components/UpdateNotice.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      {/* Outside App so the "new version" notice also shows on the sign-in page */}
      <UpdateNotice />
    </AuthProvider>
  </React.StrictMode>
);

// Production only: in development the worker would keep serving old files while you edit
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
