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
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* v1 routes */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <PrivateRoute>
              <Contacts />
            </PrivateRoute>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <PrivateRoute>
              <CampaignNew />
            </PrivateRoute>
          }
        />
        <Route
          path="/campaigns"
          element={
            <PrivateRoute>
              <CampaignHistory />
            </PrivateRoute>
          }
        />

        {/* v2 routes — same components for now; new features live here */}
        <Route path="/v2/dashboard" element={<PrivateRoute><Dashboard v2 /></PrivateRoute>} />
        <Route path="/v2/contacts" element={<PrivateRoute><Contacts v2 /></PrivateRoute>} />
        <Route path="/v2/campaigns/new" element={<PrivateRoute><CampaignNew v2 /></PrivateRoute>} />
        <Route path="/v2/campaigns" element={<PrivateRoute><CampaignHistory v2 /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ChatAssistant />
    </BrowserRouter>
  );
}

export default App;
