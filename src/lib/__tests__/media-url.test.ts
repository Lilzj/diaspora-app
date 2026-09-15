/**
 * Where a photograph's bytes are — 15 Sep 2026.
 *
 * Listing cards handed a media identifier to `<Image>` as if it were an address,
 * so no card ever showed its photograph.
 */
import { API_BASE_URL } from '../apiClient';
import { isMediaId, mediaImageUrl, photoUriOf } from '../media-url';

const COVER = '7723a578-86c1-4831-aef9-2e171685ddc1';
const BASE = API_BASE_URL.replace(/\/+$/, '');

describe('the image route', () => {
  it('addresses a rendition of a media identifier, medium unless asked', () => {
    expect(mediaImageUrl(COVER)).toBe(`${BASE}/media/${COVER}/variants/medium`);
    expect(mediaImageUrl(COVER, 'thumbnail')).toBe(`${BASE}/media/${COVER}/variants/thumbnail`);
    expect(mediaImageUrl(COVER, 'original')).toBe(`${BASE}/media/${COVER}/content`);
  });

  it('builds nothing from something that is not an identifier', () => {
    expect(mediaImageUrl('')).toBeNull();
    expect(mediaImageUrl(undefined)).toBeNull();
    expect(mediaImageUrl('undefined')).toBeNull();
    expect(mediaImageUrl('file:///data/user/0/photo.jpg')).toBeNull();
    expect(isMediaId(`  ${COVER} `)).toBe(true);
  });
});

describe('whatever a listing carries for its photo', () => {
  it('reads an identifier, a reference, or an address', () => {
    expect(photoUriOf(COVER)).toBe(`${BASE}/media/${COVER}/variants/medium`);
    expect(photoUriOf({ mediaId: COVER })).toBe(`${BASE}/media/${COVER}/variants/medium`);
    expect(photoUriOf('https://cdn.example/signed?sig=1')).toBe('https://cdn.example/signed?sig=1');
    expect(photoUriOf('file:///data/user/0/cache/picked.jpg')).toBe('file:///data/user/0/cache/picked.jpg');
  });

  it('is null for nothing, and for text that is neither', () => {
    expect(photoUriOf(null)).toBeNull();
    expect(photoUriOf('')).toBeNull();
    expect(photoUriOf({ mediaId: null })).toBeNull();
    expect(photoUriOf('a photo of my sofa')).toBeNull();
  });
});
