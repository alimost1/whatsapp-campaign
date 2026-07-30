import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Send, Image, MessageSquare, AlertCircle } from 'lucide-react';

const WHATSAPP_LIMIT = 1024;

export default function CampaignNew({ v2 } = {}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [contactGroup, setContactGroup] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [instanceName, setInstanceName] = useState(localStorage.getItem('evolutionInstance') || '');
  const [groups, setGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'info'|'success'|'error', msg }
  const [progress, setProgress] = useState(null); // { sent: 0, failed: 0, total: 0 }
  const pollingRef = useRef(null); // tracks active polling timer (avoid stale-closure bug)
  const imageInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/contacts/groups')
      .then((res) => setGroups(res.data || []))
      .catch(() => setGroups([]));
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setStatus({ type: 'error', msg: 'Campaign name is required.' });
    if (!message.trim()) return setStatus({ type: 'error', msg: 'Message text is required.' });

    setSending(true);
    setStatus(null);
    setProgress({ sent: 0, failed: 0, total: 0 });

    // Save instance name for next time
    if (instanceName.trim()) localStorage.setItem('evolutionInstance', instanceName.trim());

    try {
      // 1. Create campaign
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('message_text', message.trim());
      if (contactGroup) formData.append('contact_group', contactGroup);
      if (image) formData.append('image', image);

      const campaignRes = await api.post('/campaigns', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const campaignId = campaignRes.data.id;

      // 2. Enqueue (returns 202 immediately — worker handles sending in background)
      await api.post(`/campaigns/${campaignId}/send`, {
        instanceName: instanceName.trim(),
      });

      setStatus({
        type: 'info',
        msg: 'Campaign queued — sending in background. You can navigate away; check Campaign History for progress.',
      });
      setProgress({ sent: 0, failed: 0, total: campaignRes.data.total_contacts || 0 });

      // 3. Poll for progress
      startPolling(campaignId);
    } catch (err) {
      setSending(false);
      const msg = err.response?.status === 409
        ? 'Campaign is already sending.'
        : (err.response?.data?.error || 'Failed to send campaign.');
      setStatus({ type: 'error', msg });
    }
  };

  const startPolling = (campaignId) => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    const poll = async () => {
      try {
        const res = await api.get(`/campaigns/${campaignId}`);
        const c = res.data;
        setProgress({ sent: c.sent_count || 0, failed: c.failed_count || 0, total: c.total_contacts || 0 });
        if (c.status === 'completed' || c.status === 'failed') {
          setSending(false);
          setStatus({
            type: c.status === 'completed' ? 'success' : 'error',
            msg: c.status === 'completed'
              ? `Campaign completed! ${c.sent_count} sent, ${c.failed_count} failed.`
              : `Campaign failed. ${c.sent_count} sent, ${c.failed_count} failed.`,
          });
          pollingRef.current = null;
          return;
        }
      } catch {
        // keep polling
      }
      pollingRef.current = setTimeout(poll, 2000);
    };
    poll();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-green-600 p-2 rounded-lg">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-800">New Campaign</span>
          <a href={v2 ? "/v2/dashboard" : "/dashboard"} className="ml-auto text-sm text-green-600 hover:underline">
            ← Back
          </a>
        </div>
      
          {v2 && (
            <span className="ml-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-semibold">
              v2 · yoorika
            </span>
          )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign name */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Campaign Details</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. July Promotion"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Message */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Message</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message Text *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Write your message here..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none"
                required
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-400">WhatsApp limit: {WHATSAPP_LIMIT} chars</span>
                <span className={`text-xs ${message.length > WHATSAPP_LIMIT ? 'text-red-500' : 'text-gray-400'}`}>
                  {message.length}/{WHATSAPP_LIMIT}
                </span>
              </div>
            </div>

            {/* Image */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Image (optional)</label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-green-600 border border-green-600 px-4 py-2 rounded-lg hover:bg-green-50 transition"
                >
                  <Image className="w-4 h-4" />
                  {image ? 'Change Image' : 'Add Image'}
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                {imagePreview && (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => { setImage(null); setImagePreview(''); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Recipients</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Group</label>
              <select
                value={contactGroup}
                onChange={(e) => setContactGroup(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              >
                <option value="">All contacts</option>
                {groups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Leave empty to send to all contacts.
              </p>
            </div>
          </div>

          {/* Sending config */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Sending Settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Evolution Instance Name *</label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="e.g. my-instance"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                The name of your Evolution API instance.
              </p>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
              status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {status.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {status.msg}
            </div>
          )}

          {/* Progress */}
          {progress && sending && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Sending progress</span>
                <span className="font-medium">{progress.sent + progress.failed} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Sent: {progress.sent}</span>
                <span>Failed: {progress.failed}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <span className="animate-spin">◌</span>
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Campaign
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}