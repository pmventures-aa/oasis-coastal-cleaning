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
    '33486': 'Boca Raton', '33487': 'Boca Raton', '33496': 'Boca Raton', '33498': 'Boca Raton'
  };
