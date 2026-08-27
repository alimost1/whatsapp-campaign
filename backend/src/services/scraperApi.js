/**
 * Google Maps Scraper API Service
 * Provides job-based async scraping for the frontend
 */
import crypto from 'crypto';
import { scrapeCategory } from '../../../../map-com/src/scrapers/googleMapsScraperPuppeteer.js';

// In-memory job store (for production, use Redis or database)
const jobs = new Map();

function generateJobId() {
  return crypto.randomBytes(8).toString('hex');
}

export async function startScrapingJob({ category, location, maxResults, headless }) {
  const jobId = generateJobId();
  
  const job = {
    id: jobId,
    status: 'running',
    category,
    location,
    maxResults: parseInt(maxResults) || 20,
    headless: headless !== false,
    progress: 0,
    results: [],
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  
  jobs.set(jobId, job);
  
  // Run scraping in background
  runScrapingJob(jobId, { category, location, maxResults: job.maxResults, headless: job.headless })
    .catch(err => {
      console.error('[Scraper] Job failed:', err);
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = err.message;
        j.completedAt = new Date().toISOString();
      }
    });
  
  return { jobId };
}

async function runScrapingJob(jobId, options) {
  const job = jobs.get(jobId);
  if (!job) return;
  
  try {
    job.progress = 10;
    
    // Use the existing scrapeCategory function
    const results = await scrapeCategory(
      options.category,
      options.location,
      options.maxResults,
      { headless: options.headless }
    );
    
    job.results = results;
    job.progress = 100;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  }
}

export function getJobStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return { error: 'Job not found' };
  }
  return job;
}

export function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// Cleanup old jobs periodically (keep last 100)
setInterval(() => {
  const allJobs = Array.from(jobs.entries())
    .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));
  if (allJobs.length > 100) {
    for (const [id] of allJobs.slice(100)) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes