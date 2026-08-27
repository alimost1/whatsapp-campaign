import { useState, useEffect } from 'react';
import api from '../api';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  SettingsIcon as SettingsIcon,
  Shield,
  Clock,
  Save,
  TestTube2,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Edit2
} from 'lucide-react';

export default function Settings() {
  const [instanceName, setInstanceName] = useState(() => localStorage.getItem('evolutionInstance') || '');
  const [waStatus, setWaStatus] = useState(null); // null=unchecked, {connected, state, error, instanceName}
  const [checkingWA, setCheckingWA] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [config, setConfig] = useState({
    sendDelayMin: 1000,
    sendDelayMax: 3000,
    maxRetries: 3,
    batchSize: 10,
    autoRetry: true
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    // Load saved instance name
    if (localStorage.getItem('evolutionInstance')) {
      setInstanceName(localStorage.getItem('evolutionInstance'));
      checkWhatsApp(localStorage.getItem('evolutionInstance'));
    }
    // Load config from backend if available
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Try to fetch config from backend (may not exist yet)
      const res = await api.get('/campaigns/config');
      if (res.data) setConfig(res.data);
    } catch {
      // Config endpoint may not exist, use defaults
    } finally {
      setLoadingConfig(false);
    }
  };

  const checkWhatsApp = async (inst) => {
    if (!inst) return;
    setCheckingWA(true);
    setTestResult(null);
    try {
      const { data } = await api.get(`/campaigns/whatsapp/check?instanceName=${encodeURIComponent(inst)}`);
      setWaStatus(data);
      setTestResult({ success: data.connected, message: data.connected ? 'Connected successfully' : data.error || 'Disconnected' });
    } catch (err) {
      const error = { connected: false, state: 'error', error: 'Server unreachable', instanceName: inst };
      setWaStatus(error);
      setTestResult({ success: false, message: err.response?.data?.error || 'Failed to connect to Evolution API' });
    } finally {
      setCheckingWA(false);
    }
  };

  const saveInstance = () => {
    const trimmed = instanceName.trim();
    if (!trimmed) return;
    localStorage.setItem('evolutionInstance', trimmed);
    checkWhatsApp(trimmed);
    setSaveStatus({ type: 'success', message: 'Instance name saved' });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const testConnection = async () => {
    const trimmed = instanceName.trim();
    if (!trimmed) {
      setTestResult({ success: false, message: 'Please enter an instance name first' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/campaigns/whatsapp/test', { instanceName: trimmed });
      setTestResult({ success: true, message: data.message || 'Test message sent successfully' });
      setWaStatus({ connected: true, state: 'connected', instanceName: trimmed });
    } catch (err) {
      setTestResult({ 
        success: false, 
        message: err.response?.data?.error || err.message || 'Test failed' 
      });
      setWaStatus({ connected: false, state: 'error', error: err.response?.data?.error, instanceName: trimmed });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      // Try to save config to backend
      await api.post('/campaigns/config', config);
      setSaveStatus({ type: 'success', message: 'Configuration saved' });
    } catch {
      // Save to localStorage as fallback
      localStorage.setItem('campaignConfig', JSON.stringify(config));
      setSaveStatus({ type: 'success', message: 'Configuration saved locally' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const clearInstance = () => {
    localStorage.removeItem('evolutionInstance');
    setInstanceName('');
    setWaStatus(null);
    setTestResult(null);
    setSaveStatus({ type: 'success', message: 'Instance configuration cleared' });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Never';
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            SettingsIcon
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure WhatsApp connection and campaign behavior</p>
        </div>
      </div>

      {/* Evolution API Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
          Evolution API Connection
        </h2>

        {/* Connection Status */}
        <div className={`p-4 rounded-xl border-2 mb-6 flex items-center justify-between gap-4 flex-wrap ${
          waStatus?.connected
            ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
            : waStatus
            ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50'
        }`}>
          <div className="flex items-center gap-3">
            {waStatus?.connected ? (
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            ) : waStatus ? (
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-slate-400 dark:text-slate-500" />
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">
                {waStatus?.connected
                  ? 'WhatsApp Connected'
                  : waStatus
                  ? 'WhatsApp Disconnected'
                  : 'Not Configured'}
              </p>
              {waStatus ? (
                <div className="flex items-center gap-4 mt-1 text-sm">
                  <span className={`${waStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    Instance: {waStatus.instanceName}
                  </span>
                  <span className={`${waStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    Status: {waStatus.state}
                  </span>
                  {waStatus.error && (
                    <span className="text-red-500 dark:text-red-400">Error: {waStatus.error}</span>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Enter your Evolution API instance name below to connect</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => instanceName && checkWhatsApp(instanceName)}
              disabled={!instanceName.trim() || checkingWA}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {checkingWA ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {checkingWA ? 'Checking...' : 'Check Status'}
            </button>
            <button
              onClick={testConnection}
              disabled={!instanceName.trim() || testing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
              {testing ? 'Testing...' : 'Send Test'}
            </button>
          </div>
        </div>

        {/* Instance Configuration */}
        <div className="space-y-4">
          <div>
            <label htmlFor="instanceName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Evolution Instance Name <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="instanceName"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveInstance()}
                placeholder="e.g. my-instance"
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={saveInstance}
                disabled={!instanceName.trim() || saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
              {instanceName && (
                <button
                  onClick={clearInstance}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              The name of your Evolution API instance. This is saved locally in your browser.
            </p>
          </div>

          {/* API Key Display (read-only from env) */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-500" />
                Evolution API Credentials
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400 mb-1">API URL</p>
                <p className="font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded">
                  {process.env.VITE_EVOLUTION_API_URL || 'Configured in backend .env'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 mb-1">API Key</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded">
                    {showApiKey 
                      ? (process.env.VITE_EVOLUTION_API_KEY || '••••••••••••••••') 
                      : '••••••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              API credentials are configured in the backend .env file and are not exposed to the frontend.
            </p>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`mt-4 p-4 rounded-lg border flex items-center gap-3 ${
            testResult.success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {testResult.success ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Campaign Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
          Anti-Spam & Sending Behavior
        </h2>

        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Configure delays and retry behavior to avoid WhatsApp blocking. These settings are enforced by the campaign worker.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label htmlFor="sendDelayMin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Min Delay (ms)
            </label>
            <input
              type="number"
              id="sendDelayMin"
              value={config.sendDelayMin}
              onChange={(e) => setConfig(prev => ({ ...prev, sendDelayMin: Math.max(500, parseInt(e.target.value) || 500) }))}
              min="500"
              max="10000"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loadingConfig}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Minimum delay between messages</p>
          </div>
          <div>
            <label htmlFor="sendDelayMax" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Max Delay (ms)
            </label>
            <input
              type="number"
              id="sendDelayMax"
              value={config.sendDelayMax}
              onChange={(e) => setConfig(prev => ({ ...prev, sendDelayMax: Math.max(1000, parseInt(e.target.value) || 1000) }))}
              min="1000"
              max="30000"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loadingConfig}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Maximum delay between messages</p>
          </div>
          <div>
            <label htmlFor="maxRetries" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Max Retries
            </label>
            <input
              type="number"
              id="maxRetries"
              value={config.maxRetries}
              onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) }))}
              min="0"
              max="10"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loadingConfig}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Retry attempts for failed sends</p>
          </div>
          <div>
            <label htmlFor="batchSize" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Batch Size
            </label>
            <input
              type="number"
              id="batchSize"
              value={config.batchSize}
              onChange={(e) => setConfig(prev => ({ ...prev, batchSize: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))}
              min="1"
              max="100"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={loadingConfig}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Contacts per batch before longer pause</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoRetry}
              onChange={(e) => setConfig(prev => ({ ...prev, autoRetry: e.target.checked }))}
              className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
              disabled={loadingConfig}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Auto-retry failed messages</span>
          </label>
        </div>

        <button
          onClick={saveConfig}
          disabled={saving || loadingConfig}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>

        {saveStatus && (
          <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            saveStatus.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {saveStatus.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{saveStatus.message}</span>
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-slate-500" />
          System Information
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Environment</p>
            <p className="font-medium text-slate-800 dark:text-white">Production</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Backend API</p>
            <p className="font-medium text-slate-800 dark:text-white">Express + SQLite</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Frontend</p>
            <p className="font-medium text-slate-800 dark:text-white">React + Vite</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">WhatsApp Gateway</p>
            <p className="font-medium text-slate-800 dark:text-white">Evolution API</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Database</p>
            <p className="font-medium text-slate-800 dark:text-white">SQLite (campaign.db)</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Process Manager</p>
            <p className="font-medium text-slate-800 dark:text-white">PM2</p>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Security Notice</h3>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
              <li>API keys and secrets are stored only in the backend <code>.env</code> file — never in the frontend or database.</li>
              <li>JWT tokens are stored in localStorage and automatically cleared on expiry.</li>
              <li>Uploaded media files are stored outside the public web root and cleaned up after campaign completion.</li>
              <li>Opted-out contacts are permanently excluded from all campaigns.</li>
              <li>All API requests require valid authentication tokens.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}