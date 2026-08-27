import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Send,
  Image,
  FileText,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  Plus,
  Trash2,
  Eye,
  Paperclip
} from 'lucide-react';

const WHATSAPP_LIMIT = 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'
];
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB
const MAX_FILES = 10;

export default function CampaignNew() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [contactGroup, setContactGroup] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [instanceName, setInstanceName] = useState(localStorage.getItem('evolutionInstance') || '');
  const [groups, setGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const pollingRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/contacts/groups')
      .then((res) => setGroups(res.data || []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const validateFile = (file) => {
    const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
    if (!allowedTypes.includes(file.type)) {
      return `File type "${file.type}" is not allowed. Allowed: images (JPG, PNG, GIF, WEBP), documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT)`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds maximum size of 16 MB`;
    }
    return null;
  };

  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFiles = (files) => {
    const newAttachments = [...attachments];
    for (const file of files) {
      if (newAttachments.length >= MAX_FILES) {
        setStatus({ type: 'error', msg: `Maximum ${MAX_FILES} attachments allowed` });
        break;
      }
      const error = validateFile(file);
      if (error) {
        setStatus({ type: 'error', msg: error });
        continue;
      }
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      const preview = isImage ? URL.createObjectURL(file) : null;
      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        isImage,
        preview
      });
    }
    setAttachments(newAttachments);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
      return prev.filter(a => a.id !== id);
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setStatus({ type: 'error', msg: 'Campaign name is required.' });
    if (!message.trim()) return setStatus({ type: 'error', msg: 'Message text is required.' });
    if (!instanceName.trim()) return setStatus({ type: 'error', msg: 'Evolution instance name is required.' });

    setSending(true);
    setStatus(null);
    setProgress({ sent: 0, failed: 0, total: 0 });

    // Save instance name for next time
    localStorage.setItem('evolutionInstance', instanceName.trim());

    try {
      // 1. Create campaign with attachments
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('message', message.trim());
      if (contactGroup) formData.append('contact_group', contactGroup);
      formData.append('instanceName', instanceName.trim());
      formData.append('channel', 'evolution');

      // Add attachments
      attachments.forEach((attachment) => {
        formData.append('attachments', attachment.file);
      });

      const campaignRes = await api.post('/campaigns', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const campaignId = campaignRes.data.id;

      // 2. Enqueue for sending (returns 202 immediately — worker handles sending in background)
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
        if (c.status === 'completed' || c.status === 'sent' || c.status === 'failed') {
          setSending(false);
          setStatus({
            type: (c.status === 'completed' || c.status === 'sent') ? 'success' : 'error',
            msg: (c.status === 'completed' || c.status === 'sent')
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">New Campaign</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Create and send a WhatsApp campaign with attachments</p>
        </div>
        <button
          onClick={() => navigate('/campaigns')}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Campaign History
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Details */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
            Campaign Details
          </h2>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. July Promotion"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              required
              disabled={sending}
            />
          </div>
        </div>

        {/* Message */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
            Message
          </h2>
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Message Text <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Write your message here... Use variables like {{name}} for personalization"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none font-mono text-sm"
              required
              disabled={sending}
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-slate-400 dark:text-slate-500">WhatsApp limit: {WHATSAPP_LIMIT} chars</span>
              <span className={`text-xs ${message.length > WHATSAPP_LIMIT ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                {message.length}/{WHATSAPP_LIMIT}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Available variables:</span>{' '}
              <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{{name}}</code>{' '}
              <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{{phone}}</code>
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-green-600 dark:text-green-400" />
            Attachments (Images & Documents)
          </h2>
          
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors relative ${
              attachments.length > 0 ? 'border-slate-300 dark:border-slate-600' : 'border-slate-300 dark:border-slate-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={[
                ...ALLOWED_IMAGE_TYPES,
                ...ALLOWED_DOC_TYPES
              ].join(',')}
              multiple
              onChange={handleFilesChange}
              className="hidden"
            />
            
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Paperclip className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  Drop files here, or click to browse
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Images (JPG, PNG, GIF, WEBP) • Documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT)
                  <br />Max 16 MB per file • Max 10 files
                </p>
              </div>
            ) : (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {attachments.length}/{MAX_FILES} files attached. Click to add more.
              </div>
            )}
          </div>

          {/* Attachment List */}
          {attachments.length > 0 && (
            <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
              {attachments.map((attachment) => {
                const FileIcon = getFileIcon(attachment.type);
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
                  >
                    <div className={`p-2 rounded-lg ${getFileColor(attachment.type)}`}>
                      <FileIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate">{attachment.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>{formatFileSize(attachment.size)}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded text-xs">
                          {attachment.isImage ? 'Image' : 'Document'}
                        </span>
                      </p>
                    </div>
                    {attachment.isImage && attachment.preview && (
                      <button
                        type="button"
                        onClick={() => window.open(attachment.preview, '_blank')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        aria-label="Preview image"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label="Remove attachment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {status && status.type === 'error' && attachments.length > 0 && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
              {status.msg}
            </div>
          )}
        </div>

        {/* Recipients */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
            Recipients
          </h2>
          <div>
            <label htmlFor="contactGroup" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Contact Group
            </label>
            <select
              id="contactGroup"
              value={contactGroup}
              onChange={(e) => setContactGroup(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={sending}
            >
              <option value="">All contacts</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Leave empty to send to all contacts.</p>
          </div>
        </div>

        {/* Sending Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
            Sending Settings
          </h2>
          <div>
            <label htmlFor="instanceName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Evolution Instance Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="instanceName"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="e.g. my-instance"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              required
              disabled={sending}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">The name of your Evolution API instance (configured in Settings).</p>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            status.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' :
            status.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
            'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
          }`}>
            {status.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {status.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
            {status.type === 'info' && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
            <span>{status.msg}</span>
          </div>
        )}

        {/* Progress */}
        {progress && sending && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-green-600" />
              Sending Progress
            </h3>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-400">Sending progress</span>
              <span className="font-medium text-slate-800 dark:text-white">{progress.sent + progress.failed} / {progress.total}</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
              <span>Sent: {progress.sent}</span>
              <span>Failed: {progress.failed}</span>
              {progress.total > 0 && (
                <span>{Math.round(((progress.sent + progress.failed) / progress.total) * 100)}%</span>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send Campaign
            </>
          )}
        </button>
      </form>
    </div>
  );
}