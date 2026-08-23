/**
 * Phone number normalization for WhatsApp sending.
 *
 * Evolution API / WhatsApp expect an international MSISDN without '+'.
 * Moroccan local numbers entered as 06XXXXXXXX or 07XXXXXXXX must go out
 * as 212XXXXXXXXX — otherwise the message silently fails or misroutes.
 *
 * Examples:
 *   '0688463591'      → '212688463591'
 *   '06 88 46 35 91'  → '212688463591'
 *   '+212 688 463 591'→ '212688463591'
 *   '00212688463591'  → '212688463591'
 *   '+33612345678'    → '33612345678'  (other countries untouched)
 */

const DEFAULT_COUNTRY_PREFIX = '212'; // Morocco

export function toWhatsAppNumber(input) {
  if (input == null) return '';
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return '';

  // International prefix typed with 00 → drop the 00
  digits = digits.replace(/^00+/, '');

  // Already has a country code (either the default one or any other country)
  if (digits.startsWith(DEFAULT_COUNTRY_PREFIX)) {
    return digits;
  }

  // Moroccan local format: 0 + 9 digits (e.g. 0688463591) → swap trunk 0 for 212
  if (digits.length === 10 && digits.startsWith('0')) {
    return DEFAULT_COUNTRY_PREFIX + digits.slice(1);
  }

  // Already looks like an international number from another country
  return digits;
}

/**
 * Returns the normalized number, or null when the input clearly isn't a
 * phone number (too short to be dialable).
 */
export function normalizePhone(input) {
  const normalized = toWhatsAppNumber(input);
  // Min: 212 + 9 digits = 12 for Morocco; be lenient for foreign numbers.
  return normalized.length >= 10 ? normalized : null;
}
