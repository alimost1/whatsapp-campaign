import { useState, useEffect } from 'react';
import api from '../api';
import { Search, Loader2, X, CheckCircle, AlertCircle, Download, Trash2, MapPin, Building2, Phone, Globe, FileText, Plus } from 'lucide-react';

export default function Scraper() {
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [headless, setHeadless] = useState(true);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('idle'); // idle, running, completed, failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);

  const startScraping = async (e) => {
    e.preventDefault();
    if (!category.trim() || !location.trim()) {
      setError('Category and location are required');
      return;
    }

    setError('');
    setJobStatus('running');
    setProgress(0);
    setResults([]);
    setPolling(true);

    try {
      const response = await api.post('/v2/scraper/google-maps', {
        category: category.trim(),
        location: location.trim(),
        maxResults: parseInt(maxResults) || 20,
        headless
      });
      setJobId(response.data.jobId);
    } catch (err) {
      console.error('Failed to start scraping:', err);
      setError(err.response?.data?.error || 'Failed to start scraping job');
      setJobStatus('failed');
      setPolling(false);
    }
  };

  const pollJobStatus = async () => {
    if (!jobId || !polling) return;

    try {
      const response = await api.get(`/v2/scraper/status/${jobId}`);
      const job = response.data;

      setProgress(job.progress || 0);
      setJobStatus(job.status);

      if (job.status === 'completed') {
        setResults(job.results || []);
        setPolling(false);
      } else if (job.status === 'failed') {
        setError(job.error || 'Scraping job failed');
        setPolling(false);
      }
    } catch (err) {
      console.error('Failed to poll job status:', err);
      setError('Failed to check job status');
      setJobStatus('failed');
      setPolling(false);
    }
  };

  useEffect(() => {
    if (!polling || !jobId) return;

    const interval = setInterval(pollJobStatus, 2000);
    pollJobStatus(); // Initial check

    return () => clearInterval(interval);
  }, [polling, jobId]);

  const resetForm = () => {
    setJobId(null);
    setJobStatus('idle');
    setProgress(0);
    setResults([]);
    setError('');
    setPolling(false);
  };

  const exportResults = () => {
    if (results.length === 0) return;
    const csv = [
      ['Name', 'Address', 'Phone', 'Website', 'Category', 'Rating', 'Reviews'].join(','),
      ...results.map(r => [
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.address || '').replace(/"/g, '""')}"`,
        `"${(r.phone || '').replace(/"/g, '""')}"`,
        `"${(r.website || '').replace(/"/g, '""')}"`,
        `"${(r.category || '').replace(/"/g, '""')}"`,
        r.rating || '',
        r.reviews || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `scraped_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const importToContacts = async () => {
    if (results.length === 0) return;

    try {
      // Transform results to contacts format
      const contacts = results
        .filter(r => r.phone)
        .map(r => ({
          name: r.name || '',
          phone: r.phone,
          group_name: 'Scraped Leads',
          source: 'scraper'
        }));

      if (contacts.length === 0) {
        setError('No contacts with phone numbers to import');
        return;
      }

      // Use the existing contacts upload endpoint
      const formData = new FormData();
      const csvContent = [
        ['name', 'phone', 'group_name'].join(','),
        ...contacts.map(c => [
          `"${c.name.replace(/"/g, '""')}"`,
          `"${c.phone.replace(/"/g, '""')}"`,
          `"${c.group_name.replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'scraped_contacts.csv', { type: 'text/csv' });
      formData.append('file', file);

      const response = await api.post('/contacts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setError(`Successfully imported ${response.data.imported} contacts (${response.data.skipped} skipped)`);
      // Clear results after successful import
      setResults([]);
      setJobStatus('idle');
      setJobId(null);
    } catch (err) {
      console.error('Failed to import contacts:', err);
      setError(err.response?.data?.error || 'Failed to import contacts');
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Lead Scraper</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Find businesses and extract contact information from Google Maps.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scraper Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-green-600 dark:text-green-400" />
              Scrape New Leads
            </h2>

            <form onSubmit={startScraping} className="space-y-4">
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="category"
                  placeholder="e.g., restaurant, hotel, plumber"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  disabled={jobStatus === 'running'}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Business type to search for</p>
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="location"
                  placeholder="e.g., Marrakech, Morocco"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  disabled={jobStatus === 'running'}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">City, region, or address</p>
              </div>

              <div>
                <label htmlFor="maxResults" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Maximum Results
                </label>
                <input
                  type="number"
                  id="maxResults"
                  min="1"
                  max="100"
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value) || 20)}
                  disabled={jobStatus === 'running'}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="headless"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                  disabled={jobStatus === 'running'}
                  className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500 disabled:opacity-50"
                />
                <label htmlFor="headless" className="ml-2 text-sm text-slate-700 dark:text-slate-300">
                  Run in background (headless)
                </label>
              </div>

              <button
                type="submit"
                disabled={jobStatus === 'running' || !category.trim() || !location.trim()}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {jobStatus === 'running' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Start Scraping
                  </>
                )}
              </button>

              {jobStatus === 'running' && (
                <button
                  type="button"
                  onClick={() => {
                    setPolling(false);
                    setJobStatus('idle');
                    setError('Job cancelled');
                  }}
                  className="w-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Progress & Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card */}
          {jobStatus !== 'idle' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Loader2 className={`w-5 h-5 ${jobStatus === 'running' ? 'animate-spin text-green-600' : jobStatus === 'completed' ? 'text-green-600' : 'text-red-500'}`} />
                Scraping Progress
              </h2>

              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    jobStatus === 'completed' ? 'bg-green-500' : jobStatus === 'failed' ? 'bg-red-500' : 'bg-green-600'
                  }`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  {jobStatus === 'running'
                    ? `Progress: ${progress}%`
                    : jobStatus === 'completed'
                    ? 'Completed'
                    : jobStatus === 'failed'
                    ? 'Failed'
                    : 'Starting...'}
                </span>
                <span className="font-medium text-slate-800 dark:text-white">
                  {jobStatus === 'completed' && results.length > 0 && `${results.length} leads found`}
                </span>
              </div>

              {(jobStatus === 'completed' || jobStatus === 'failed') && (
                <button
                  onClick={resetForm}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {jobStatus === 'completed' ? 'Scrape Again' : 'Retry'}
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {jobStatus === 'completed' && results.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Results ({results.length} leads found)
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Click to copy phone numbers. Use Import to add to contacts.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportResults}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={importToContacts}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Import to Contacts
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
                {results.map((lead, index) => (
                  <div
                    key={index}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-medium text-slate-800 dark:text-white truncate">{lead.name || 'Unnamed Business'}</h3>
                          {lead.rating && (
                            <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                              <span className="text-lg">★</span> {lead.rating}
                              {lead.reviews && ` (${lead.reviews})`}
                            </span>
                          )}
                        </div>
                        {lead.address && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{lead.address}</span>
                          </p>
                        )}
                        {lead.category && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{lead.category}</span>
                          </p>
                        )}
                        {lead.website && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-green-600 dark:text-green-400 hover:underline truncate block">
                              {lead.website}
                            </a>
                          </p>
                        )}
                      </div>
                      {lead.phone && (
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <button
                            onClick={() => navigator.clipboard.writeText(lead.phone)}
                            className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1"
                            title="Copy phone number"
                          >
                            <Phone className="w-4 h-4" />
                            Copy
                          </button>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                            {lead.phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jobStatus === 'completed' && results.length === 0 && !error && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Search className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <h3 className="text-slate-800 dark:text-white mb-1">No leads found</h3>
              <p className="text-slate-500 dark:text-slate-400">Try a different category or location.</p>
              <button
                onClick={resetForm}
                className="mt-4 text-green-600 dark:text-green-400 hover:underline text-sm"
              >
                New Search
              </button>
            </div>
          )}

          {jobStatus === 'idle' && !jobId && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Search className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <h3 className="text-slate-800 dark:text-white mb-1">Ready to Scrape</h3>
              <p className="text-slate-500 dark:text-slate-400">Enter a category and location to start scraping leads from Google Maps.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}