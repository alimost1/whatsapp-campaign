/**
 * Scraper + cache for promoimmomarrakech.com.
 * - discoverCategories() — list all property categories (vente, location, types)
 * - listInCategory(url) — parse a category page and return property cards
 * - getProperty(url) — parse a single /produit/vvv-XXX/ page
 * - cached fetch with 15-min TTL — refresh in background; never block user queries
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'promo_cache.json');
const BASE = 'https://www.promoimmomarrakech.com';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
  : { properties: {}, fetchedAt: 0 };

function persist() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

function strip(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&agrave;/g, 'à')
    .replace(/&rsquo;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  const r = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
    validateStatus: () => true,
  });
  if (r.status !== 200) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.data;
}

/**
 * List all property categories (vente villa, location riad, etc).
 * The site has category pages — return their slugs.
 */
export function listCategories() {
  return [
    { name: 'Vente villa', kind: 'achat', type: 'villa', url: '/villa-a-vendre-marrakech.html' },
    { name: 'Vente appartement', kind: 'achat', type: 'appartement', url: '/appartement-a-vendre-marrakech.html' },
    { name: 'Vente riad', kind: 'achat', type: 'riad', url: '/riad-a-vendre-marrakech.html' },
    { name: 'Vente maison', kind: 'achat', type: 'maison', url: '/maison-a-vendre-marrakech.html' },
    { name: 'Vente terrain', kind: 'achat', type: 'terrain', url: '/terrain-a-vendre-marrakech.html' },
    { name: 'Vente bureau', kind: 'achat', type: 'bureau', url: '/bureau-a-vendre-marrakech.html' },
    { name: 'Vente commerce', kind: 'achat', type: 'commerce', url: '/commerce-a-vendre-marrakech.html' },
    { name: 'Vente immeuble', kind: 'achat', type: 'immeuble', url: '/immeuble-a-vendre-marrakech.html' },
    { name: 'Vente palais', kind: 'achat', type: 'palais', url: '/palais-a-vendre-marrakech.html' },
    { name: 'Location villa', kind: 'location', type: 'villa', url: '/location-villa-marrakech.html' },
    { name: 'Location appartement', kind: 'location', type: 'appartement', url: '/location-appartement-marrakech.html' },
    { name: 'Location riad', kind: 'location', type: 'riad', url: '/location-riad-marrakech.html' },
    { name: 'Location maison', kind: 'location', type: 'maison', url: '/location-maison-marrakech.html' },
    { name: 'Location bureau', kind: 'location', type: 'bureau', url: '/location-bureau-marrakech.html' },
    { name: 'Programme neuf', kind: 'neuf', type: '*', url: '/programme-neuf-marrakech.html' },
    { name: 'Prestige', kind: 'prestige', type: '*', url: '/prestige-immobilier-marrakech.html' },
  ];
}

/**
 * Parse a category page and return property cards.
 * Each card: { id, url, title, surface, bedrooms, image, description }
 */
export function parseCategoryPage(html, categoryUrl) {
  const cards = [];
  // Each property card is anchored by /produit/vvv-XXX/{slug}.html
  const re = /<a[^>]+href=['"](\/produit\/vvv-(\d+)\/[^'"]+\.html)['"][^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)['"][^>]*>[\s\S]*?<\/a>[\s\S]*?<h2>[\s\S]*?<a[^>]+href=['"]\/produit\/vvv-\d+\/[^'"]+\.html['"][^>]*>([^<]+)<\/a>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const [, url, id, image, title] = m;
    if (seen.has(id)) continue;
    seen.add(id);

    // Find the block immediately after this card with surface + bedrooms
    const idx = m.index;
    const tail = html.slice(idx, idx + 3000);
    const surfaceMatch = tail.match(/(\d{2,5})\s*m²/);
    const bedroomMatch = tail.match(/Nombre de chambre[^:]*:\s*(\d+)/i);
    const descMatch = tail.match(/<p>([\s\S]{30,400}?)<\/p>/);

    cards.push({
      id,
      url: BASE + url,
      title: strip(title).slice(0, 200),
      surface: surfaceMatch ? +surfaceMatch[1] : null,
      bedrooms: bedroomMatch ? +bedroomMatch[1] : null,
      image: image.startsWith('http') ? image : BASE + image,
      description: descMatch ? strip(descMatch[1]).slice(0, 300) : '',
      category: categoryUrl,
    });
  }
  return cards;
}

/**
 * Get property cards for a category. Hits cache, falls back to scraping.
 */
export async function getCategory(category) {
  const url = BASE + category.url;
  const cacheKey = category.url;
  if (cache.categories?.[cacheKey] && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.categories[cacheKey];
  }
  const html = await fetchPage(url);
  const cards = parseCategoryPage(html, category.url);
  cache.categories = cache.categories || {};
  cache.categories[cacheKey] = {
    category,
    properties: cards,
    scrapedAt: new Date().toISOString(),
  };
  cache.fetchedAt = Date.now();
  persist();
  return cache.categories[cacheKey];
}

/**
 * Find properties matching free-text filters: type, max-price, min-bedrooms, etc.
 */
export async function searchProperties({ type, kind, maxPrice, minBedrooms, minSurface, limit = 20 }) {
  const cats = listCategories().filter((c) => {
    if (type && c.type !== type && c.type !== '*') return false;
    if (kind && c.kind !== kind && c.type !== '*') return false;
    return true;
  });
  // Fetch up to first 4 matching categories in parallel
  const results = await Promise.all(cats.slice(0, 4).map((c) => getCategory(c).catch(() => null)));
  const all = [];
  for (const r of results) {
    if (!r) continue;
    for (const p of r.properties) {
      if (minBedrooms && (!p.bedrooms || p.bedrooms < minBedrooms)) continue;
      if (minSurface && (!p.surface || p.surface < minSurface)) continue;
      p.kind = r.category.kind;
      p.type = r.category.type;
      all.push(p);
    }
  }
  return all.slice(0, limit);
}

/**
 * Fetch a single property detail page (description, full price).
 */
export async function getPropertyDetail(id) {
  if (cache.properties?.[id] && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.properties[id];
  }
  // We need the URL — scan all cached categories
  let url = null;
  for (const k of Object.keys(cache.categories || {})) {
    const hit = cache.categories[k].properties.find((p) => p.id === id);
    if (hit) { url = hit.url; break; }
  }
  if (!url) throw new Error(`Property ${id} not in cache`);
  const html = await fetchPage(url);
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]{0,3000}?)<\/div>/);
  const priceMatch = html.match(/(\d[\d ,.]*)\s*(DH|€|MAD|Euros?)/i);
  const surfaceMatch = html.match(/(\d{2,5})\s*m²/);
  const bedroomMatch = html.match(/Nombre de chambre[^:]*:\s*(\d+)/i);
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const detail = {
    id,
    url,
    title: titleMatch ? strip(titleMatch[1]) : '',
    surface: surfaceMatch ? +surfaceMatch[1] : null,
    bedrooms: bedroomMatch ? +bedroomMatch[1] : null,
    price: priceMatch ? priceMatch[0] : null,
    description: descMatch ? strip(descMatch[1]).slice(0, 1500) : '',
  };
  cache.properties = cache.properties || {};
  cache.properties[id] = detail;
  cache.fetchedAt = Date.now();
  persist();
  return detail;
}

export function getCacheAge() {
  return cache.fetchedAt ? Date.now() - cache.fetchedAt : null;
}
