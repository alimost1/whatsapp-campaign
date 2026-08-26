import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { 
  Users, 
  Plus, 
  Search, 
  Upload, 
  Trash2, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../api';

export default function ModernLayout() {
  const location = useLocation();
  const [instanceName, setInstanceName] = useState(() => localStorage.getItem('evolutionInstance') || '');
  const [waStatus, setWaStatus] = useState(null); // null=unchecked, {connected, state, error, instanceName}
  const [checkingWA, setCheckingWA] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    // Auto-check WhatsApp if instance name saved
    if (localStorage.getItem('evolutionInstance')) {
      checkWhatsApp(localStorage.getItem('evolutionInstance'));
    }
  }, []);

  const checkWhatsApp = async (inst) => {
    if (!inst) return;
    setCheckingWA(true);
    try {
      const { data } = await api.get(`/campaigns/whatsapp/check?instanceName=${encodeURIComponent(inst)}`);
      setWaStatus(data);
    } catch {
      setWaStatus({ connected: false, state: 'error', error: 'Server unreachable', instanceName: inst });
    } finally {
      setCheckingWA(false);
    }
  };

  const saveInstance = () => {
    const trimmed = instanceName.trim();
    if (!trimmed) return;
    localStorage.setItem('evolutionInstance', trimmed);
    checkWhatsApp(trimmed);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    window.location.href = '/login';
  };

  const statusBadge = (status) => {
    const classes = {
      draft: 'bg-gray-100 text-gray-700',
      sending: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[status] || classes.draft}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="sidebar w-64 flex-shrink-0 flex flex-col">
        <div className="brand flex items-center gap-3 p-4">
          <div className="brand-mark w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-xl text-gray-800">Map-Com</div>
            <div className="text-sm text-gray-500">Leads → WhatsApp</div>
          </div>
        </div>
        <nav className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-gray-400 px-3">Menu</div>
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-base font-medium rounded-lg
              ${isActive ? 'text-gray-900 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <Users className="w-5 h-5" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/scraper"
            end
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-base font-medium rounded-lg
              ${isActive ? 'text-gray-900 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <Search className="w-5 h-5" />
            <span>Scraper</span>
          </NavLink>
          <NavLink
            to="/contacts"
            end
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-base font-medium rounded-lg
              ${isActive ? 'text-gray-900 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <Upload className="w-5 h-5" />
            <span>Contacts</span>
          </NavLink>
          <NavLink
            to="/campaigns"
            end
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-base font-medium rounded-lg
              ${isActive ? 'text-gray-900 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <Send className="w-5 h-5" />
            <span>Campaigns</span>
          </NavLink>
          <NavLink
            to="/settings"
            end
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2 text-base font-medium rounded-lg
              ${isActive ? 'text-gray-900 bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
            `}
          >
            <CheckCircle className="w-5 h-5" />
            <span>Settings</span>
          </NavLink>
        </nav>
        <div className="mt-auto p-4">
          <div className={`flex items-center gap-3 p-3 rounded-lg 
            ${waStatus?.connected ? 'border-green-300 bg-green-50' 
              : waStatus ? 'border-red-300 bg-red-50' 
              : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-2">
              {waStatus?.connected ? (
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-green-600" />
                </div>
              ) : waStatus ? (
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <WifiOff className="w-4 h-4 text-red-500" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-gray-400" />
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {waStatus?.connected
                  ? `Connected to WhatsApp`
                  : waStatus
                  ? `WhatsApp Disconnected`
                  : 'WhatsApp Not Connected'}
              </p>
              {waStatus ? (
                <p className={`text-sm ${waStatus.connected ? 'text-green-600' : 'text-red-500'}`}>
                  {waStatus.connected
                    ? `Instance \"${waStatus.instanceName}\" — status: ${waStatus.state}`
                    : waStatus.error || `Status: ${waStatus.state}`}
                </p>
              ) : (
                <p className="text-sm text-gray-500">Add your Evolution API instance name below</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 w-full">
            <input
              type="text"
              placeholder="Evolution API instance name"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveInstance()}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={saveInstance}
              disabled={!instanceName.trim() || checkingWA}
              className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap transition"
            >
              {checkingWA ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : waStatus?.connected ? (
                <RefreshCw className="w-4 h-4" />
              ) : waStatus ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {checkingWA ? 'Checking...' : waStatus?.connected ? 'Recheck' : waStatus ? 'Retry' : 'Connect'}
            </button>
          </div>
          {waStatus?.connected && (
            <div className="mt-2 px-3 py-2 bg-green-100 border-t border-green-200 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              WhatsApp is connected and ready to send campaigns
            </div>
          )}
          {waStatus && !waStatus.connected && (
            <div className="mt-2 px-3 py-2 bg-red-100 border-t border-red-200 flex items-center gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4" />
              {waStatus.error === 'Instance not found'
                ? 'Instance not found. Make sure it exists in Evolution API and is connected.'
                : 'Could not connect. Check the instance name or your Evolution API server.'}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
<span className="text-lg font-bold text-gray-800">
  {location.pathname === '/dashboard' ? 'Dashboard' :
   location.pathname === '/contacts' ? 'Contacts' :
   location.pathname.startsWith('/campaigns') ? 'Campaigns' :
   location.pathname === '/scraper' ? 'Scraper' :
   location.pathname === '/settings' ? 'Settings' :
   'Map-Com'}
</span>
          </div>
          <div className="flex items-center gap-4 ml-4">
            <span className="text-sm text-gray-600">Hello, {localStorage.getItem('userName') || 'User'}</span>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 transition">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="pl-10 pr-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button onClick={() => {/* export functionality */}} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
              ⇩ Export
            </button>
            <button onClick={() => {/* new campaign */}} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}