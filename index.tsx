import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import Auth from './components/Auth';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrowserRouter } from 'react-router-dom';

const AppWithAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#131314]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Allow guest access - App handles routing and auth checks internally
  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppWithAuth />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);