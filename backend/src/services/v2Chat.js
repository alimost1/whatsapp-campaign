/**
 * v2 chat assistant for Promo Immo Marrakech.
 * - Interprets user messages (FR/AR/EN) and routes to scraper queries.
 * - Returns rich answers with property cards + a CTA.
 * - No LLM dependency — pure intent parsing. Easy to swap for an LLM later.
 *
 * Supported intents:
 *   - "villa à vendre" / "villas"  → list vente villa
 *   - "location appartement" / "rent"  → list location appartement
 *   - "riad pas cher" / "min surface"  → filter by surface/bedrooms
 *   - "prix" / "combien" / "tarif"  → show prices
 *   - "detail <id>" / "plus d'info sur ..."  → getPropertyDetail
 *   - "categorie" / "que vendez-vous" / "types"  → list categories
 *   - "contact" / "téléphone" / "adresse"  → agency contact info
 *   - default → help message + suggested questions
 */
import { searchProperties, getPropertyDetail, listCategories } from './promoScraper.js';

const AGENCY = {
  name: 'Promo Immo Marrakech',
  whatsapp: '+212****5359',
  whatsappDisplay: '+212****5359',
  site: 'https://www.promoimmomarrakech.com',
  email: null,
};

// Simple synonym map FR/AR/EN
const SYNONYMS = {
  villa: ['villa', 'villas', 'فيلا', 'فيلات'],
  appartement: ['appartement', 'apartments', 'appart', 'شقة', 'شقق'],
  riad: ['riad', 'riads', 'رياض', 'رياض'],
  maison: ['maison', 'maisons', 'house', 'houses', 'منزل', 'منازل'],
  terrain: ['terrain', 'terrains', 'land', 'أرض', 'أراضي'],
  bureau: ['bureau', 'bureaux', 'office', 'مكتب'],
  commerce: ['commerce', 'commercial', 'محل', 'محلات'],
  immeuble: ['immeuble', 'building', 'عمارة'],
  palais: ['palais', 'palace', 'قصر'],

  achat: ['achat', 'acheter', 'vente', 'vendre', 'buy', 'sale', 'للبيع', 'شراء', 'بيع'],
  location: ['location', 'louer', 'louer', 'rent', 'rental', 'للإيجار', 'إيجار', 'كراء'],
  neuf: ['neuf', 'new', 'programme', 'جديد'],
  prestige: ['prestige', 'luxury', 'فاخر', 'فاخرة'],

  bedrooms: ['chambre', 'chambres', 'bedroom', 'bedrooms', 'غرفة', 'غرف'],
  surface: ['surface', 'm²', 'm2', 'مساحة', 'مساحة'],
};

// Neighborhoods in Marrakech (FR/AR/EN)
const NEIGHBORHOODS = [
  'gueliz', 'guéliz', 'medina', 'médina', 'hivernage', 'palmeraie', 'palmeraies',
  'ourika', 'amizmiz', 'agdal', 'alouidane', 'targa', 'mhamid', 'sidi abbad',
  'sidi ghanem', 'sidi maarouf', 'souissi', 'daoudiate', 'boufakrane',
  'massira', 'hay riad', 'hay mohammadi', 'ennassim', 'kh sabbah',
  'سيدي أبي', 'أكدال', 'غليز', 'النخيل', 'حاحة', 'مراكش المدينة',
];

// Detect intent tokens
function hasAny(text, group) {
  const t = text.toLowerCase();
  return group.some((w) => t.includes(w.toLowerCase()));
}

function extractNumber(text, key) {
  const re = new RegExp(`(\\d{1,5})\\s*${key}`, 'i');
  const m = text.match(re);
  return m ? +m[1] : null;
}

function detectNeighborhood(text) {
  const lower = text.toLowerCase();
  for (const n of NEIGHBORHOODS) {
    if (lower.includes(n.toLowerCase())) return n;
  }
  return null;
}

export async function chat(message) {
  const text = (message || '').trim();
  if (!text) return defaultHelp();

  // 1. property detail request
  const idMatch = text.match(/\b(\d{3,4})\b/);
  // Heuristic: short code like "vvv-616" or just a 3-4 digit number
  const explicitId = text.match(/(?:vvv[- ]?|ref[- ]?|id[- ]?)(\d{3,5})/i);
  if (explicitId) {
    try {
      const d = await getPropertyDetail(explicitId[1]);
      return {
        intent: 'property_detail',
        text: `Voici les détails de **${d.title || 'cette propriété'}** (ref ${d.id}):\n\n${d.description || 'Pas de description disponible.'}`,
        cards: [
          {
            id: d.id,
            title: d.title,
            surface: d.surface,
            bedrooms: d.bedrooms,
            price: d.price,
            url: d.url,
          },
        ],
      };
    } catch {
      return {
        intent: 'property_detail',
        text: `Je n'ai pas pu charger les détails de la propriété ${explicitId[1]} — elle n'est peut-être plus en ligne. Voulez-vous voir les villas disponibles ?`,
        suggestions: ['Villas à vendre', 'Appartements à vendre'],
      };
    }
  }

  // 2. contact request
  if (hasAny(text, ['contact', 'téléphone', 'telephone', 'phone', 'appeler', 'joindre', 'adresse', 'اتصال', 'هاتف'])) {
    return {
      intent: 'contact',
      text: `📞 **Promo Immo Marrakech**\n\nPour visiter une propriété ou en savoir plus, contactez-nous directement sur WhatsApp :\n👉 [Cliquez pour discuter sur WhatsApp](https://api.whatsapp.com/send?phone=${AGENCY.whatsapp}&text=Bonjour%21%20Je%20viens%20de%20votre%20chatbot.)\n\nNotre équipe est disponible 24h/24 et 7j/7.`,
      whatsappLink: `https://api.whatsapp.com/send?phone=${AGENCY.whatsapp}&text=Bonjour%21`,
    };
  }

  // 3. categories / types
  if (hasAny(text, ['catégorie', 'categorie', 'que vendez', 'types', 'que proposez', 'quoi', 'types de bien', 'أنواع', 'فئات'])) {
    const cats = listCategories();
    const lines = cats.map((c) => `- **${c.name}**`);
    return {
      intent: 'categories',
      text: `Voici les types de biens que nous proposons :\n\n${lines.join('\n')}\n\nDites-moi ce qui vous intéresse (ex: "villa à vendre", "appartement à louer").`,
      suggestions: ['Vente villa', 'Vente appartement', 'Location riad', 'Programme neuf'],
    };
  }

  // 4. property search
  const type =
    SYNONYMS.villa.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'villa'
    : SYNONYMS.appartement.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'appartement'
    : SYNONYMS.riad.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'riad'
    : SYNONYMS.maison.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'maison'
    : SYNONYMS.terrain.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'terrain'
    : SYNONYMS.bureau.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'bureau'
    : SYNONYMS.commerce.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'commerce'
    : SYNONYMS.immeuble.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'immeuble'
    : SYNONYMS.palais.find((w) => text.toLowerCase().includes(w.toLowerCase())) ? 'palais'
    : null;

  const kind = hasAny(text, SYNONYMS.achat) ? 'achat'
    : hasAny(text, SYNONYMS.location) ? 'location'
    : hasAny(text, SYNONYMS.neuf) ? 'neuf'
    : hasAny(text, SYNONYMS.prestige) ? 'prestige'
    : null;

  // Even if user only said one of (type, kind), still do a search
  const minBedrooms = extractNumber(text, 'chambre') || extractNumber(text, 'bedroom');
  const minSurface = extractNumber(text, 'm') || extractNumber(text, 'm²') || extractNumber(text, 'surface');
  const neighborhood = detectNeighborhood(text);

  if (type || kind || neighborhood || text.match(/propose|dispo|cherche|voulez|vendez|louer|vendre/i)) {
    let props = await searchProperties({
      type,
      kind,
      minBedrooms,
      minSurface,
      limit: 12,
    });
    // If user asked for a type/kind that has 0 listings, fall back to all categories
    // and surface the original filter in the intro so the customer understands.
    let fellBack = false;
    if (props.length === 0 && (type || kind)) {
      props = await searchProperties({
        type: null,
        kind: null,
        minBedrooms,
        minSurface,
        limit: 12,
      });
      fellBack = true;
    }
    const title =
      type && kind
        ? `${kind === 'achat' ? 'À vendre' : kind === 'location' ? 'À louer' : 'Programme'} : ${type}`
        : type ? `Biens de type ${type}`
        : kind ? `Biens en ${kind}`
        : neighborhood ? `Biens à ${neighborhood}`
        : 'Biens disponibles';
    // Decide which set of properties to show:
    //   - If neighborhood filter found matches, use them
    //   - Otherwise fall back to all properties in matching type/kind
    let neighborhoodMatched = false;
    let propsToShow = props;
    if (neighborhood) {
      const needle = neighborhood.toLowerCase();
      const filtered = props.filter((p) => {
        const haystack = `${p.title || ''} ${p.url || ''} ${p.description || ''}`.toLowerCase();
        return haystack.includes(needle);
      });
      if (filtered.length > 0) {
        propsToShow = filtered;
        neighborhoodMatched = true;
      }
    }
    if (propsToShow.length === 0) {
      return {
        intent: 'search',
        text: neighborhood
          ? `Je n'ai pas trouvé de bien à *${neighborhood}* pour le moment. Contactez-nous pour un recherche personnalisée :`
          : `Je n'ai pas trouvé de biens correspondant à votre demande pour le moment. Voulez-vous voir d'autres catégories ?`,
        suggestions: listCategories().slice(0, 6).map((c) => c.name),
      };
    }
    let introText;
    if (fellBack) {
      const what = type ? `de ${type}` : kind ? `en ${kind}` : 'correspondant';
      introText = `Aucun bien ${what} pour le moment. Voici ${propsToShow.length} biens disponibles qui pourraient vous intéresser :`;
    } else if (neighborhood && !neighborhoodMatched) {
      introText = `Pas de bien à *${neighborhood}* actuellement, mais voici ${propsToShow.length} biens similaires disponibles :`;
    } else {
      introText = `Voici ${propsToShow.length} ${title.toLowerCase()} disponible${propsToShow.length > 1 ? 's' : ''} :`;
    }
    return {
      intent: 'search',
      text: introText,
      cards: propsToShow.map((p) => ({
        id: p.id,
        title: p.title,
        surface: p.surface,
        bedrooms: p.bedrooms,
        image: p.image,
        url: p.url,
        kind: p.kind,
        type: p.type,
      })),
      suggestions: ['Plus de détails', 'Voir les riads', 'Contact'],
    };
  }

  return defaultHelp();
}

function defaultHelp() {
  return {
    intent: 'help',
    text: `Bonjour ! 👋 Je suis l'assistant de **Promo Immo Marrakech**.\n\nJe peux vous aider à :\n- Trouver une **villa**, un **appartement**, un **riad** ou un **terrain**\n- Chercher des biens en **vente** ou en **location**\n- Voir les détails d'une propriété\n- Vous mettre en contact avec l'agence\n\nQue cherchez-vous ?`,
    suggestions: [
      'Villas à vendre',
      'Appartements à louer',
      'Riads à vendre',
      'Voir les catégories',
      'Contact',
    ],
  };
}

export async function listCategoriesAPI() {
  return listCategories();
}
