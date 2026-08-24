import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { authorizationUrl, handleCallback, isConnected, searchAndImport } from '../services/gmailService.js';

const router = Router();

router.get('/status', requireAuth, (req, res) => res.json({ connected: isConnected() }));

// Return the Google authorization URL through an authenticated XHR request.
// Navigating directly to /authorize cannot carry the Bearer token in a browser.
router.get('/authorize-url', requireAuth, (req, res) => {
  try { res.json({ url: authorizationUrl() }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Kept for direct/manual use; the frontend uses /authorize-url above.
router.get('/authorize', requireAuth, (req, res) => {
  try { res.redirect(authorizationUrl()); }
  catch (error) { res.status(500).send(error.message); }
});

router.get('/oauth2callback', async (req, res) => {
  try {
    await handleCallback(req.query.code);
    res.redirect('/scraper?gmail=connected');
  } catch (error) {
    res.status(500).send(`Gmail authorization failed: ${error.message}`);
  }
});

router.post('/extract', requireAuth, async (req, res) => {
  try {
    const query = String(req.body.query || 'subject:"Booking - S268835"').trim();
    res.json(await searchAndImport({ query, userId: req.userId, maxResults: req.body.maxResults }));
  } catch (error) {
    const status = error.message.includes('not connected') || error.message.includes('OAuth') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
