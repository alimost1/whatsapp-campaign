import { NavLink, useLocation, Outlet } from 'react-router-dom';
import {
  Users,
  Search,
  Upload,
  MessageSquare,
  Send,
  Settings,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Plus,
  BarChart2,
  FileText,
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
      pending: 'bg-blue-100 text-blue-700',
      queued: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[status] || classes.draft}`}>
        {status}
      </span>
    );
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: BarChart2 },
    { path: '/scraper', label: 'Scraper', icon: Search },
    { path: '/contacts', label: 'Contacts', icon: Users },
    { path: '/campaigns', label: 'Campaigns', icon: Send },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
        <div className="brand flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="brand-mark w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-xl text-slate-900 dark:text-white">Map-Com</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Leads → WhatsApp</div>
          </div>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400 px-3 mb-2">Main</div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 text-base font-medium rounded-lg mx-2 my-1 transition-colors
                ${isActive
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }
              `}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* WhatsApp Connection Panel */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className={`flex items-center gap-3 p-3 rounded-lg ${
            waStatus?.connected
              ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
              : waStatus
              ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
          }`}>
            <div className="flex items-center gap-2">
              {waStatus?.connected ? (
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
              ) : waStatus ? (
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <WifiOff className="w-4 h-4 text-red-500 dark:text-red-400" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-white truncate">
                {waStatus?.connected
                  ? 'Connected to WhatsApp'
                  : waStatus
                  ? 'WhatsApp Disconnected'
                  : 'WhatsApp Not Connected'}
              </p>
              {waStatus ? (
                <p className={`text-sm truncate ${waStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {waStatus.connected
                    ? `Instance "${waStatus.instanceName}" — status: ${waStatus.state}`
                    : waStatus.error || `Status: ${waStatus.state}`}
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Add your Evolution API instance name below</p>
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
              className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={saveInstance}
              disabled={!instanceName.trim() || checkingWA}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap transition-colors"
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
            <div className="mt-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              WhatsApp is connected and ready to send campaigns
            </div>
          )}
          {waStatus && !waStatus.connected && (
            <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {waStatus.error === 'Instance not found'
                ? 'Instance not found. Make sure it exists in Evolution API and is connected.'
                : 'Could not connect. Check the instance name or your Evolution API server.'}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-800 dark:text-white">
              {location.pathname === '/dashboard' ? 'Dashboard' :
               location.pathname === '/scraper' ? 'Scraper' :
               location.pathname === '/contacts' ? 'Contacts' :
               location.pathname.startsWith('/campaigns') ? 'Campaigns' :
               location.pathname === '/settings' ? 'Settings' :
               'Map-Com'}
            </span>
          </div>

          <div className="flex items-center gap-4 ml-4">
            <span className="text-sm text-slate-600 dark:text-slate-300 hidden sm:block">Hello, {localStorage.getItem('userName') || 'User'}</span>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Logout">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search contacts…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="pl-10 pr-4 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 w-64"
              />
            </div>
            <button className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Export
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}