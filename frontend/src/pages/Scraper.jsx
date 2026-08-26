import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const Scraper = () => {
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [headless, setHeadless] = useState(true);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, running, completed, failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);

  const startScraping = async () => {
    if (!category || !location) {
      setError('Category and location are required');
      return;
    }
    setError(null);
    setStatus('running');
    setProgress(0);
    setResults([]);
    try {
      const response = await api.post('/v2/scraper/google-maps', {
        category,
        location,
        maxResults,
        headless,
      });
      const { jobId } = response.data;
      setJobId(jobId);
      setPolling(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setStatus('failed');
    }
  };

  useEffect(() => {
    if (!jobId || !polling) return;
    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/v2/scraper/status/${jobId}`);
        const job = response.data;
        setStatus(job.status);
        setProgress(job.progress || 0);
        if (job.results) setResults(job.results);
        if (job.error) setError(job.error);
        if (job.status === 'completed' || job.status === 'failed') {
          setPolling(false);
          clearInterval(interval);
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        setStatus('failed');
        setPolling(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, polling]);

  useEffect(() => {
    if (status === 'idle' && jobId) {
      // Reset jobId when going back to idle
      setJobId(null);
    }
  }, [status, jobId]);

  const handleReset = () => {
    setJobId(null);
    setStatus('idle');
    setProgress(0);
    setResults([]);
    setError(null);
    setPolling(false);
    setCategory('');
    setLocation('');
    setMaxResults(20);
    setHeadless(true);
  };

  return (
    <section className="page-content">
      <header className="page-header">
        <div>
          <h1>Lead Scraper</h1>
          <p>Find businesses and extract contact information from Google Maps.</p>
        </div>
      </header>

      <div className="scraper-grid">
        {/* Scraper Form */}
        <div className="scraper-form-card">
          <h2>Scrape New Leads</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            startScraping();
          }}>
            <div className="form-group">
              <label htmlFor="category">Category</label>
              <input
                type="text"
                id="category"
                placeholder="e.g., restaurant, hotel, plumber"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                disabled={status === 'running'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                placeholder="e.g., Marrakech, Morocco"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                disabled={status === 'running'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="maxResults">Maximum Results</label>
              <input
                type="number"
                id="maxResults"
                min="1"
                max="100"
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value) || 20)}
                disabled={status === 'running'}
              />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                  disabled={status === 'running'}
                />
                Run in background (headless)
              </label>
            </div>
            <button type="submit" disabled={status === 'running'}>
              {status === 'running' ? 'Scraping...' : 'Start Scraping'}
            </button>
            {status === 'running' && (
              <button type="button" onClick={handleReset} className="cancel">
                Cancel
              </button>
            )}
          </form>
          {error && <div className="error">{error}</div>}
        </div>

        {/* Progress Card */}
        {jobId && (
          <div className="progress-card">
            <h2>Scraping Progress</h2>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
            <p>{status === 'running' ? `Progress: ${progress}%` : status === 'completed' ? 'Completed' : 'Failed'}</p>
            {status === 'completed' && (
              <button type="button" onClick={handleReset}>
                Scrape Again
              </button>
            )}
            {status === 'failed' && (
              <button type="button" onClick={handleReset}>
                Retry
              </button>
            )}
          </div>
        )}

        {/* Results / Empty / Error State */}
        {status === 'completed' && (
          <div className="results-card">
            <h2>Results ({results.length} leads found)</h2>
            {results.length === 0 ? (
              <p>No leads found for the specified category and location.</p>
            ) : (
              <>
                <p>Here are the scraped leads:</p>
                <ul className="results-list">
                  {results.map((lead, index) => (
                    <li key={index} className="result-item">
                      <strong>{lead.name || 'Unnamed'}</strong>
                      <br />
                      {lead.address && <span>{lead.address}</span>}
                      <br />
                      {lead.phone && <span>Phone: {lead.phone}</span>}
                      <br />
                      {lead.website && <span>Website: {lead.website}</span>}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={handleReset}>
                  New Search
                </button>
              </>
            )}
          </div>
        )}

        {/* Placeholder when idle */}
        {status === 'idle' && !jobId && (
          <div className="empty-state">
            <h2>Ready to Scrape</h2>
            <p>Enter a category and location to start scraping leads from Google Maps.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default Scraper;
