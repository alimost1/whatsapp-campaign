import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  MessageSquare,
  Eye,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  Image,
  Paperclip,
  TrendingUp,
  Download,
  RefreshCw
} from 'lucide-react';

export default function CampaignHistory() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const pollingRef = useRef(null);

  const fetchCampaigns = async () => {
    try {
      const res = await api.get('/campaigns');
      setCampaigns(res.data || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Live polling: refresh while any campaign is in 'sending' or 'pending' state
  useEffect(() => {
    const hasActive = campaigns.some((c) => c.status === 'sending' || c.status === 'pending' || c.status === 'queued');
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (hasActive) {
      pollingRef.current = setTimeout(async () => {
        await fetchCampaigns();
      }, 3000);
    }
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [campaigns]);

  const fetchCampaignDetails = async (campaignId) => {
    setLogsLoading(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}`);
      const data = res.data;
      setLogs(data.send_logs || []);
      setAttachments(data.attachments || []);
    } catch {
      setLogs([]);
      setAttachments([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const openDetails = async (campaign) => {
    setSelectedCampaign(campaign);
    await fetchCampaignDetails(campaign.id);
  };

  const closeDetails = () => {
    setSelectedCampaign(null);
    setLogs([]);
    setAttachments([]);
  };

  const statusBadge = (status) => {
    const classes = {
      draft: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
      pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      queued: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      sending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      sent: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    };
    const icons = {
      draft: Clock,
      pending: Clock,
      queued: Clock,
      sending: Loader2,
      completed: CheckCircle,
      sent: CheckCircle,
      failed: AlertCircle,
    };
    const Icon = icons[status] || Clock;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${classes[status] || classes.draft} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return Image;
    if (type === 'application/pdf') return FileText;
    if (type.includes('word') || type.includes('document')) return FileText;
    if (type.includes('excel') || type.includes('spreadsheet')) return FileText;
    if (type.includes('powerpoint') || type.includes('presentation')) return FileText;
    return FileText;
  };

  const getFileColor = (type) => {
    if (type.startsWith('image/')) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
    if (type === 'application/pdf') return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
    return 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const exportCampaignData = (campaign) => {
    const csv = [
      ['Phone', 'Status', 'Variant', 'Error', 'Sent At'].join(','),
      ...logs.map(log => [
        `"${log.phone}"`,
        `"${log.status}"`,
        `"${log.variant || ''}"`,
        `"${(log.error_message || '').replace(/"/g, '""')}"`,
        `"${log.sent_at}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `campaign_${campaign.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Campaign History</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor and track your WhatsApp campaigns</p>
        </div>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Paperclip className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-green-600" />
          <p className="text-slate-500 dark:text-slate-400">Loading campaigns...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <h3 className="text-slate-800 dark:text-white mb-1">No campaigns yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first WhatsApp campaign to get started.</p>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            <Paperclip className="w-4 h-4" />
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
              All Campaigns
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                {campaigns.length}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchCampaigns}
                disabled={loading}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Group</th>
                  <th className="px-6 py-3 font-medium">Attachments</th>
                  <th className="px-6 py-3 font-medium">Sent</th>
                  <th className="px-6 py-3 font-medium">Failed</th>
                  <th className="px-6 py-3 font-medium">Progress</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {campaigns.map((c) => {
                  const total = c.total_contacts || 0;
                  const sent = c.sent_count || 0;
                  const failed = c.failed_count || 0;
                  const done = sent + failed;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isActive = c.status === 'sending' || c.status === 'pending' || c.status === 'queued';
                  return (
                    <tr key={c.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isActive ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-white max-w-xs truncate">{c.name}</td>
                      <td className="px-6 py-4">{statusBadge(c.status)}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                        {c.contact_group ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                            {c.contact_group}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">All contacts</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(c.attachments || []).length > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                            <Paperclip className="w-3 h-3 mr-1" />
                            {c.attachments.length}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-green-600 dark:text-green-400 font-medium">{sent}</td>
                      <td className="px-6 py-4 text-red-500 dark:text-red-400 font-medium">{failed}</td>
                      <td className="px-6 py-4">
                        {total > 0 && (
                          <div className="w-32">
                            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  c.status === 'failed' ? 'bg-red-500' : c.status === 'completed' || c.status === 'sent' ? 'bg-green-500' : 'bg-yellow-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 text-right">{done}/{total} ({pct}%)</p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">{formatDate(c.created_at)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openDetails(c)}
                          disabled={logsLoading}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 id="modal-title" className="font-semibold text-slate-800 dark:text-white">{selectedCampaign.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Created: {formatDate(selectedCampaign.created_at)}</span>
                  {selectedCampaign.scheduledAt && (
                    <span className="text-slate-500 dark:text-slate-400">Scheduled: {formatDate(selectedCampaign.scheduledAt)}</span>
                  )}
                  {selectedCampaign.instanceName && (
                    <span className="text-slate-500 dark:text-slate-400">Instance: {selectedCampaign.instanceName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportCampaignData(selectedCampaign)}
                  disabled={logs.length === 0}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Logs
                </button>
                <button
                  onClick={closeDetails}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Campaign Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Total Contacts</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{selectedCampaign.total_contacts || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Sent</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{selectedCampaign.sent_count || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Failed</p>
                      <p className="text-2xl font-bold text-red-500 dark:text-red-400">{selectedCampaign.failed_count || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Delivery Rate</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">
                        {selectedCampaign.total_contacts > 0
                          ? `${Math.round(((selectedCampaign.sent_count || 0) / selectedCampaign.total_contacts) * 100)}%`
                          : '0%'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <h4 className="font-medium text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-green-600 dark:text-green-400" />
                    Attachments ({attachments.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {attachments.map((attachment) => {
                      const FileIcon = getFileIcon(attachment.mime_type);
                      return (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600"
                        >
                          <div className={`p-2 rounded-lg ${getFileColor(attachment.mime_type)}`}>
                            <FileIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-800 dark:text-white truncate">{attachment.original_name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatFileSize(attachment.size)} • {attachment.mime_type.startsWith('image/') ? 'Image' : 'Document'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Send Logs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                    Send Logs ({logs.length})
                  </h4>
                  {logsLoading && <Loader2 className="w-4 h-4 animate-spin text-green-600" />}
                </div>

                {logsLoading ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-green-600" />
                    Loading send logs...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-slate-600 dark:text-slate-400">No send logs available for this campaign.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg text-sm flex items-center justify-between ${
                          log.status === 'sent' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                          log.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                          'bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                            {log.phone}
                          </span>
                          {log.variant && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded">
                              Variant {log.variant}
                            </span>
                          )}
                          {log.error_message && (
                            <span className="text-xs text-red-500 dark:text-red-400 truncate max-w-xs" title={log.error_message}>
                              {log.error_message}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-xs font-medium ${
                            log.status === 'sent' ? 'text-green-700 dark:text-green-300' :
                            log.status === 'failed' ? 'text-red-700 dark:text-red-300' :
                            'text-slate-600 dark:text-slate-400'
                          }`}>
                            {log.status === 'sent' ? 'Sent' : log.status === 'failed' ? 'Failed' : 'Pending'}
                          </span>
                          {log.sent_at && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(log.sent_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}