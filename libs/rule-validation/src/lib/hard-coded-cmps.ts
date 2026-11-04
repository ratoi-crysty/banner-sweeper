/**
 * The CMPs autoconsent implements in code rather than as rules (`lib/cmps/all.ts`). autoconsent
 * silently drops a rule named after one of them, and a candidate run disables all of them.
 * Recheck this list on every autoconsent upgrade.
 */
export const HARD_CODED_CMP_NAMES: readonly string[] = [
  'TrustArc-top',
  'Cybotcookiebot',
  'Sourcepoint-frame',
  'consentmanager.net',
  'Evidon',
  'Onetrust',
  'Klaro',
  'Uniconsent',
  'Conversant',
  'tiktok.com',
  'Admiral',
];
