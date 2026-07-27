import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Users, Send, MessageSquare, Plus, LogOut, Wifi, WifiOff, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [instanceName, setInstanceName] = useState(() => localStorage.getItem('evolutionInstance') || '');
  const [waStatus, setWaStatus] = useState(null); // null=unchecked, {connected, state, error}
  const [checkingWA, setCheckingWA] = useState(false);
  const userName = localStorage.getItem('userName') || 'User';

  useEffect(() => {
    Promise.all([
      api.get('/campaigns').catch(() => []),
      api.get('/contacts').catch(() => []),
    ])
      .then(([cRes, ctRes]) => {
        setCampaigns(cRes.data || []);
        setContacts(ctRes.data || []);
      })
      .catch(() => setError('Failed to load data. Is the server running?'))
      .finally(() => setLoading(false));

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
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-800">WhatsApp Campaign</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Hello, {userName}</span>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* WhatsApp Connection Status */}
        <div className={`rounded-xl border-2 mb-8 overflow-hidden ${
          waStatus?.connected
            ? 'border-green-300 bg-green-50'
            : waStatus
            ? 'border-red-300 bg-red-50'
            : 'border-gray-200 bg-white'
        }`}>
          <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            {/* Left: icon + status */}
            <div className="flex items-center gap-3">
              {waStatus?.connected ? (
                <div className="bg-green-100 p-2 rounded-full">
                  <Wifi className="w-6 h-6 text-green-600" />
                </div>
              ) : waStatus ? (
                <div className="bg-red-100 p-2 rounded-full">
                  <WifiOff className="w-6 h-6 text-red-500" />
                </div>
              ) : (
                <div className="bg-gray-100 p-2 rounded-full">
                  <Wifi className="w-6 h-6 text-gray-400" />
                </div>
              )}

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
                      ? `Instance "${waStatus.instanceName}" — status: ${waStatus.state}`
                      : waStatus.error || `Status: ${waStatus.state}`}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Add your Evolution API instance name below</p>
                )}
              </div>
            </div>

            {/* Right: input + button */}
            <div className="flex items-center gap-2 flex-1 min-w-0" style={{ maxWidth: 480 }}>
              <input
                type="text"
                placeholder="Evolution API instance name"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveInstance()}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
          </div>

          {/* Quick status indicator */}
          {waStatus?.connected && (
            <div className="px-6 py-3 bg-green-100 border-t border-green-200 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              WhatsApp is connected and ready to send campaigns
            </div>
          )}
          {waStatus && !waStatus.connected && (
            <div className="px-6 py-3 bg-red-100 border-t border-red-200 flex items-center gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4" />
              {waStatus.error === 'Instance not found'
                ? 'Instance not found. Make sure it exists in Evolution API and is connected.'
                : 'Could not connect. Check the instance name or your Evolution API server.'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <div className="flex gap-3">
            <Link
              to="/contacts"
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
            >
              Manage Contacts
            </Link>
            <Link
              to="/campaigns/new"
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{contacts.length}</p>
                  <p className="text-sm text-gray-500">Total Contacts</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Send className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{campaigns.length}</p>
                  <p className="text-sm text-gray-500">Campaigns</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">
                    {campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0)}
                  </p>
                  <p className="text-sm text-gray-500">Messages Sent</p>
                </div>
              </div>
            </div>

            {/* Recent campaigns */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Recent Campaigns</h2>
                <Link to="/campaigns" className="text-sm text-green-600 hover:text-green-700">
                  View all
                </Link>
              </div>
              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No campaigns yet.</p>
                  <Link to="/campaigns/new" className="text-green-600 hover:underline text-sm mt-1 inline-block">
                    Create your first campaign
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="px-6 py-3 font-medium">Name</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Sent</th>
                        <th className="px-6 py-3 font-medium">Failed</th>
                        <th className="px-6 py-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.slice(0, 10).map((c) => (
                        <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-800">{c.name}</td>
                          <td className="px-6 py-3">{statusBadge(c.status)}</td>
                          <td className="px-6 py-3 text-gray-600">{c.sent_count ?? 0}</td>
                          <td className="px-6 py-3 text-gray-600">{c.failed_count ?? 0}</td>
                          <td className="px-6 py-3 text-gray-500">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}