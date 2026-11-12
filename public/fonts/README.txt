Oasis Coastal Cleaning — self-hosted web fonts
==============================================

These three families used to be fetched from Google at page load. They are
served from this folder instead, for four reasons:

  * Speed. The old path was HTML -> tokens.css -> fonts.googleapis.com (a
    stylesheet) -> fonts.gstatic.com (the font files): four requests across
    three hosts before a single letter could be drawn in the right face.
    From here it is one request to the same host, and the <link rel="preload">
    in each page's <head> starts it alongside the stylesheet.

  * Layout stability. Montserrat is about 10% wider than the system sans and
    Cinzel about 26% wider than Georgia, so every line of text rewrapped when
    the fonts finally arrived and the page below it moved. Preloading a
    same-origin file closes that window.

  * Privacy. No visitor's browser contacts Google to read this site.

  * It cannot break from the outside. A Google Fonts URL is versioned and the
    hashed filenames change; these files do not.

Files are the latin and latin-extended subsets of the variable fonts, taken
from the Google Fonts API on 2026-11-12. Each family is one file per subset
covering the whole weight axis, which is why @font-face in tokens.css declares
a weight range rather than a single weight.

All three are licensed under the SIL Open Font License, Version 1.1, which
permits this redistribution. The licence and copyright for each is in the
OFL-*.txt file beside it, as the licence requires.

  Montserrat  — Copyright 2024 The Montserrat Project Authors
  Cinzel      — Copyright 2020 The Cinzel Project Authors
  Great Vibes — Copyright 2015 The Great Vibes Pro Project Authors

To update a family, download the woff2 for its subsets from the Google Fonts
API, replace the file here keeping the same name, and run ./bump-version.sh.
