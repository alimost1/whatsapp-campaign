import { useState, useEffect } from 'react';
import api from '../api';
import { MessageSquare, Eye, X } from 'lucide-react';

export default function CampaignHistory() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogs, setSelectedLogs] = useState(null); // campaign id for modal
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    api.get('/campaigns')
      .then((res) => setCampaigns(res.data || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchLogs = async (campaignId) => {
    setLogsLoading(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}`);
      setLogs(res.data.send_logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const openDetails = async (campaign) => {
    setSelectedLogs(campaign);
    await fetchLogs(campaign.id);
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
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-green-600 p-2 rounded-lg">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-800">Campaign History</span>
          <a href="/dashboard" className="ml-auto text-sm text-green-600 hover:underline">
            ← Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No campaigns yet.</p>
            <a href="/campaigns/new" className="text-green-600 hover:underline text-sm mt-1 inline-block">
              Create your first campaign
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">All Campaigns ({campaigns.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Group</th>
                    <th className="px-6 py-3 font-medium">Sent</th>
                    <th className="px-6 py-3 font-medium">Failed</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-6 py-3">{statusBadge(c.status)}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{c.contact_group || 'All'}</td>
                      <td className="px-6 py-3 text-green-600 font-medium">{c.sent_count ?? 0}</td>
                      <td className="px-6 py-3 text-red-500">{c.failed_count ?? 0}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => openDetails(c)}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Details modal */}
      {selectedLogs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{selectedLogs.name}</h3>
                <p className="text-sm text-gray-500">Send log</p>
              </div>
              <button onClick={() => setSelectedLogs(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {logsLoading ? (
                <div className="text-center text-gray-500 py-8">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">
                  No send logs available.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className={`p-3 rounded-lg text-sm flex items-center justify-between ${
                      log.status === 'sent' ? 'bg-green-50 border border-green-100' :
                      log.status === 'failed' ? 'bg-red-50 border border-red-100' :
                      'bg-gray-50 border border-gray-100'
                    }`}>
                      <div>
                        <span className="font-mono text-xs text-gray-600">{log.phone}</span>
                        {log.error_message && (
                          <span className="ml-3 text-xs text-red-500">{log.error_message}</span>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${
                        log.status === 'sent' ? 'text-green-700' :
                        log.status === 'failed' ? 'text-red-700' : 'text-gray-600'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}