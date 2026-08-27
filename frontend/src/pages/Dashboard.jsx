import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Users, Send, MessageSquare, Plus, CheckCircle, XCircle, RefreshCw, Clock, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    contacts: 0,
    todayContacts: 0,
    campaigns: 0,
    messagesSent: 0,
    failedMessages: 0,
    deliveryRate: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [campaignSummary, setCampaignSummary] = useState({
    draft: 0,
    pending: 0,
    sending: 0,
    completed: 0,
    failed: 0
  });
  const [waStatus, setWaStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats
        const statsResponse = await api.get('/api/stats');
        setStats(statsResponse.data);

        // Fetch recent activity (from v2 logs endpoint)
        const logsResponse = await api.get('/api/v2/logs?limit=10');
        setRecentActivity(logsResponse.data);

        // Fetch campaign summary
        const campaignsResponse = await api.get('/api/campaigns');
        const campaigns = campaignsResponse.data || [];
        const summary = {
          draft: campaigns.filter(c => c.status === 'draft').length,
          pending: campaigns.filter(c => c.status === 'pending').length,
          sending: campaigns.filter(c => c.status === 'sending').length,
          completed: campaigns.filter(c => c.status === 'completed' || c.status === 'sent').length,
          failed: campaigns.filter(c => c.status === 'failed').length
        };
        setCampaignSummary(summary);

        // Fetch WhatsApp status if instance name exists
        const instanceName = localStorage.getItem('evolutionInstance');
        if (instanceName) {
          try {
            const waResponse = await api.get(`/campaigns/whatsapp/check?instanceName=${encodeURIComponent(instanceName)}`);
            setWaStatus(waResponse.data);
          } catch {
            setWaStatus({ connected: false, state: 'error', error: 'Failed to check', instanceName });
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-500 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const formatTimeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval > 1) return `${interval} years ago`;
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) return `${interval} months ago`;
    interval = Math.floor(seconds / 86400);
    if (interval > 1) return `${interval} days ago`;
    interval = Math.floor(seconds / 3600);
    if (interval > 1) return `${interval} hours ago`;
    interval = Math.floor(seconds / 60);
    if (interval > 1) return `${interval} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
  };

  const statCards = [
    {
      label: 'Total Contacts',
      value: stats.contacts,
      icon: Users,
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      label: 'Today\'s Contacts',
      value: stats.todayContacts,
      icon: Send,
      color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      label: 'Campaigns',
      value: stats.campaigns,
      icon: FileText,
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20'
    },
    {
      label: 'Messages Sent',
      value: stats.messagesSent,
      icon: MessageSquare,
      color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      label: 'Failed Messages',
      value: stats.failedMessages,
      icon: XCircle,
      color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20'
    },
    {
      label: 'Delivery Rate',
      value: `${stats.deliveryRate}%`,
      icon: TrendingUp,
      color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20'
    }
  ];

  const quickActions = [
    {
      icon: Users,
      label: 'Manage Contacts',
      description: 'View, import, and organize your contacts',
      onClick: () => navigate('/contacts'),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      icon: Plus,
      label: 'Create Campaign',
      description: 'Design and send a WhatsApp blast',
      onClick: () => navigate('/campaigns/new'),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      icon: MessageSquare,
      label: 'View Campaigns',
      description: 'Monitor sent campaigns and performance',
      onClick: () => navigate('/campaigns'),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      icon: Search,
      label: 'Scrape Leads',
      description: 'Find new contacts from Google Maps',
      onClick: () => navigate('/scraper'),
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    }
  ];

  const campaignStatusItems = [
    { label: 'Draft', count: campaignSummary.draft, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' },
    { label: 'Pending', count: campaignSummary.pending, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
    { label: 'Sending', count: campaignSummary.sending, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
    { label: 'Completed', count: campaignSummary.completed, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
    { label: 'Failed', count: campaignSummary.failed, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Quick Actions */}
      <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer text-left group ${action.bgColor}`}
            >
              <div className="flex items-center mb-2">
                <div className={`p-2 rounded-lg ${action.color} ${action.bgColor}`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <div className="ml-3">
                  <p className="font-medium text-slate-800 dark:text-white">{action.label}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{action.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {statCards.map((stat, index) => (
            <div key={index} className={`p-4 rounded-xl border border-slate-200 dark:border-slate-700 ${stat.bgColor}`}>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Status Summary & WhatsApp Connection */}
      <div className="p-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Campaign Status */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Campaign Status</h3>
            <div className="flex flex-wrap gap-2">
              {campaignStatusItems.map((item, index) => (
                <span
                  key={index}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${item.bgColor} ${item.color}`}
                >
                  {item.label}: {item.count}
                </span>
              ))}
            </div>
          </div>

          {/* WhatsApp Connection */}
          <div className={`p-4 rounded-xl border-2 flex items-center justify-between gap-4 flex-wrap ${
            waStatus?.connected
              ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
              : waStatus
              ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50'
          }`}>
            <div className="flex items-center gap-3">
              {waStatus?.connected ? (
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
              ) : waStatus ? (
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <WifiOff className="w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Wifi className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">
                  {waStatus?.connected
                    ? 'Connected to WhatsApp'
                    : waStatus
                    ? 'WhatsApp Disconnected'
                    : 'WhatsApp Not Connected'}
                </p>
                {waStatus ? (
                  <p className={`text-sm ${waStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {waStatus.connected
                      ? `Instance "${waStatus.instanceName}" — ${waStatus.state}`
                      : waStatus.error || `Status: ${waStatus.state}`}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Configure Evolution API instance in Settings</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800 dark:text-white">Recent Activity</h2>
          <button
            onClick={() => navigate('/campaigns')}
            className="text-sm text-green-600 dark:text-green-400 hover:underline"
          >
            View all
          </button>
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">No recent activity.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Campaign activity will appear here once you start sending messages.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={`${activity.id}-${index}`}
                className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                      {activity.campaign_name ? (
                        <>
                          <span className="whitespace-nowrap truncate">{activity.campaign_name}</span>
                          {activity.variant && (
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded">
                              Variant {activity.variant}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">WhatsApp Message</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {activity.status === 'sent' ? (
                        `Message sent to ${activity.phone}`
                      ) : (
                        `Failed to send to ${activity.phone}: ${activity.error_message || 'Unknown error'}`
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-sm font-medium ${activity.status === 'sent' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {activity.status === 'sent' ? 'Sent' : 'Failed'}
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatTimeAgo(activity.sent_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}