import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import CampaignNew from './pages/CampaignNew';
import CampaignHistory from './pages/CampaignHistory';
import VersionBadge from './components/VersionBadge';
import ChatAssistant from './components/ChatAssistant';
import ModernLayout from './components/ModernLayout';
import Scraper from './pages/Scraper';
import Settings from './pages/Settings';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function VersionTracker() {
  // Persist the active version based on the URL, so a page refresh keeps state.
  const location = useLocation();
  useEffect(() => {
    const active = location.pathname.startsWith('/v2') ? '2' : '1';
    localStorage.setItem('preferredVersion', active);
  }, [location.pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <VersionTracker />
      <VersionBadge />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          element={
            <PrivateRoute>
              <ModernLayout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/scraper" element={<Scraper />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/campaigns/new" element={<CampaignNew />} />
                  <Route path="/campaigns" element={<CampaignHistory />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </ModernLayout>
            </PrivateRoute>
          }
        >
        </Route>
      </Routes>
      <ChatAssistant />
    </BrowserRouter>
  );
}

export default App;