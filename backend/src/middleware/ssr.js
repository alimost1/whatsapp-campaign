import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { createElement } from 'react';
import App from './src/App.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, 'dist');

export function createSsrMiddleware() {
  return async (req, res, next) => {
    // Only SSR for non-API routes that might need SEO or curl visibility
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
      return next();
    }

    try {
      const context = {};
      const appHtml = renderToString(
        createElement(StaticRouter, { location: req.url, context },
          createElement(App)
        )
      );

      // Read the index.html template
      const indexHtml = await import('fs').then(fs => 
        fs.promises.readFile(resolve(distDir, 'index.html'), 'utf-8')
      );

      // Inject the rendered app HTML
      const html = indexHtml
        .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
        .replace('</head>', '<meta name="description" content="Map-Com WhatsApp Campaign Manager"></head>');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error('SSR error:', err);
      next(); // Fall back to SPA
    }
  };
}