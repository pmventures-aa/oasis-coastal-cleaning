/**
 * ZIP to town for Kristina's own service area — the answers that need no
 * request at all. Anything outside this is looked up once by /api/zip and
 * then remembered.
 *
 * Mirrors zipCity in public/js/data.js; tests/zip.test.mjs checks they agree.
 */
export const SERVICE_AREA_ZIPS = {
    '33060': 'Pompano Beach', '33062': 'Pompano Beach', '33063': 'Margate',
    '33064': 'Pompano Beach', '33065': 'Coral Springs', '33066': 'Coconut Creek',
    '33067': 'Coral Springs', '33068': 'North Lauderdale', '33069': 'Pompano Beach',
    '33071': 'Coral Springs', '33073': 'Coconut Creek', '33076': 'Parkland',
    '33431': 'Boca Raton', '33432': 'Boca Raton', '33433': 'Boca Raton',
    '33434': 'Boca Raton', '33441': 'Deerfield Beach', '33442': 'Deerfield Beach',
    '33486': 'Boca Raton', '33487': 'Boca Raton', '33496': 'Boca Raton', '33498': 'Boca Raton',

    /* Palm Beach County. The map covered only Broward, so most of the area she
       actually serves — Delray, Boynton, Lake Worth, West Palm — fell through
       to a geocoder round trip on every quote. Each of these was resolved by
       that same geocoder and kept only where it named one of her own service
       towns, so the two agree. */
    '33401': 'West Palm Beach', '33402': 'West Palm Beach', '33404': 'Riviera Beach',
    '33405': 'West Palm Beach', '33407': 'West Palm Beach', '33409': 'West Palm Beach',
    '33410': 'Palm Beach Gardens', '33411': 'Royal Palm Beach', '33413': 'Greenacres',
    '33414': 'Wellington', '33418': 'Palm Beach Gardens', '33426': 'Boynton Beach',
    '33435': 'Boynton Beach', '33436': 'Boynton Beach', '33444': 'Delray Beach',
    '33445': 'Delray Beach', '33449': 'Wellington', '33458': 'Jupiter',
    '33460': 'Lake Worth Beach', '33462': 'Lantana', '33463': 'Greenacres',
    '33469': 'Tequesta', '33470': 'Westlake', '33483': 'Delray Beach'
  };

/**
 * Is this a town name, or is it the ZIP wearing a hat?
 *
 * The geocoder answers a postal area that has no settlement with the postcode
 * itself as the feature name, and that was being stored and then read back as
 * the city — so somebody typing 33406 was told "That is 33406".
 */
export function plausibleCity(name, zip) {
  const v = String(name == null ? '' : name).trim();
  if (v.length < 2) return false;
  if (/^\d+$/.test(v)) return false;          // a number is not a town
  if (zip && v === String(zip)) return false;
  return true;
}
