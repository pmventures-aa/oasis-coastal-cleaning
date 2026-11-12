/**
 * Taking the camera's notes off a photo before it is stored.
 *
 * A photo from a phone carries EXIF, and EXIF carries where it was taken.
 * These are photographs of the inside of people's houses, so the
 * coordinates of their front door should not be sitting in an object
 * store because somebody had location services on.
 *
 * This works on the bytes rather than decoding the image, because
 * re-encoding costs CPU this platform does not give us -- the whole
 * budget is ten milliseconds. A JPEG is a chain of marker segments and
 * the metadata ones can be lifted straight out: the pixels are untouched
 * and the file stays a valid JPEG.
 *
 * What it does NOT do: HEIC, which an iPhone shoots by default. The
 * metadata there lives in a box structure that cannot be edited this
 * cheaply, so those are refused rather than stored with their location
 * in them. Safari converts to JPEG on upload from a file input in most
 * cases; when it does not, the person is told to try again.
 */

/* APP1 holds EXIF and XMP; APP2 holds Flashpix and ICC; APP13 holds the
   Photoshop block, which is where IPTC location text ends up. The rest of
   the APPn range is maker notes and thumbnails, all of it metadata. */
const DROP = new Set([
  0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA,
  0xEB, 0xEC, 0xED, 0xEE, 0xEF,
  0xFE                                    // COM, the free-text comment
]);

export const JPEG = 'image/jpeg';
export const KEEPABLE = [JPEG, 'image/png', 'image/webp'];

export function isJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8;
}

/* HEIC/HEIF announce themselves in the ftyp box near the front. */
export function isHeic(bytes) {
  if (bytes.length < 12) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
}

/**
 * Returns a copy with the metadata segments removed, or the original if
 * it is not a JPEG. Never throws on a malformed file: a photo that cannot
 * be understood is returned untouched and the caller decides.
 */
export function stripJpegMetadata(bytes) {
  if (!isJpeg(bytes)) return { bytes, stripped: false, reason: 'not a jpeg' };

  const out = [];
  let i = 2;                               // past SOI
  out.push(bytes[0], bytes[1]);
  let removed = 0;

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xFF) break;          // not where a marker should be
    const marker = bytes[i + 1];

    /* Start of scan: the rest is compressed pixels, copied verbatim. */
    if (marker === 0xDA) {
      for (let k = i; k < bytes.length; k++) out.push(bytes[k]);
      i = bytes.length;
      break;
    }
    /* Standalone markers carry no length. */
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9) || marker === 0x01) {
      out.push(0xFF, marker);
      i += 2;
      continue;
    }
    if (i + 3 >= bytes.length) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) break;   // malformed; stop here

    if (DROP.has(marker)) {
      removed += len + 2;
    } else {
      for (let k = i; k < i + 2 + len; k++) out.push(bytes[k]);
    }
    i += 2 + len;
  }

  /* Something was wrong with the structure and we stopped early: return
     the original rather than a file cut in half. */
  if (i < bytes.length && !removed) {
    return { bytes, stripped: false, reason: 'could not read the structure' };
  }
  return { bytes: Uint8Array.from(out), stripped: true, removed };
}
