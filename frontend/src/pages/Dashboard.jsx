import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Users, Send, MessageSquare, Plus, LogOut, Wifi, WifiOff, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    contacts: 0,
    todayContacts: 0,
    messagesSent: 0,
    deliveryRate: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      console.log('Dashboard useEffect: fetching data');
      try {
        // Fetch stats
        console.log('Fetching /api/stats');
        const statsResponse = await api.get('/api/stats');
        console.log('Stats response:', statsResponse.data);
        setStats(statsResponse.data);

        // Fetch recent activity (from v2 logs endpoint)
        console.log('Fetching /api/v2/logs?limit=10');
        const logsResponse = await api.get('/api/v2/logs?limit=10');
        console.log('Logs response:', logsResponse.data);
        setRecentActivity(logsResponse.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load data. Is the server running?');
      } finally {
        setLoading(false);
        console.log('FetchData finished, loading set to false');
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border-l-4 border-red-200 text-red-700">
        <p>{error}</p>
      </div>
    );
  }

  const formatTimeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval > 1) return interval + " years ago";
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) return interval + " months ago";
    interval = Math.floor(seconds / 86400);
    if (interval > 1) return interval + " days ago";
    interval = Math.floor(seconds / 3600);
    if (interval > 1) return interval + " hours ago";
    interval = Math.floor(seconds / 60);
    if (interval > 1) return interval + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Quick Actions */}
      <div className="p-6 bg-white shadow-sm border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: <Users className="w-6 h-6 text-green-600" />,
              label: "Manage Contacts",
              description: "View, import, and organize your contacts",
              onClick: () => navigate('/contacts')
            },
            {
              icon: <Plus className="w-6 h-6 text-green-600" />,
              label: "Create Campaign",
              description: "Design and send a WhatsApp blast",
              onClick: () => navigate('/campaigns/new')
            },
            {
              icon: <MessageSquare className="w-6 h-6 text-green-600" />,
              label: "View Campaigns",
              description: "Monitor sent campaigns and performance",
              onClick: () => navigate('/campaigns')
            }
          ].map((action, index) => (
            <div key={index} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={action.onClick}>
              <div className="flex items-center mb-2">
                {action.icon}
                <div className="ml-3">
                  <p className="font-medium text-gray-800">{action.label}</p>
                  <p className="text-sm text-gray-500">{action.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6 bg-white shadow-sm border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Contacts */}
          <div className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Contacts</p>
                <p className="text-2xl font-bold text-gray-900">{stats.contacts}</p>
              </div>
            </div>
          </div>
          {/* Today's Contacts */}
          <div className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Send className="w-5 h-5 text-purple-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Today's Contacts</p>
                <p className="text-2xl font-bold text-gray-900">{stats.todayContacts}</p>
              </div>
            </div>
          </div>
          {/* Messages Sent */}
          <div className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Messages Sent</p>
                <p className="text-2xl font-bold text-gray-900">{stats.messagesSent}</p>
              </div>
            </div>
          </div>
          {/* Delivery Rate */}
          <div className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Delivery Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats.deliveryRate}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No recent activity.</p>
        ) : (
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div key={index} className="p-4 bg-white rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">
                      {activity.campaign_name ? (
                        <>
                          <span className="whitespace-nowrap">{activity.campaign_name}</span>
                          {activity.variant && (
                            <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                              Variant {activity.variant}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">WhatsApp Message</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      {activity.status === 'sent' ? (
                        `Message sent to ${activity.phone}`
                      ) : (
                        `Failed to send to ${activity.phone}: ${activity.error_message || 'Unknown error'}`
                      )}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className={activity.status === 'sent' ? 'text-green-600' : 'text-red-600'}>
                      {formatTimeAgo(activity.sent_at)}
                    </span>
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