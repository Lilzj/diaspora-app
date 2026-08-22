// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Media pipeline (Remediation Wave E)
//
// The platform has a complete media system — uploads, assets, variants, signed
// links, collections, processing, quarantine — and until this wave the client
// had **no upload client at all**. `ImagePickerInput` handed back
// `result.assets[0].uri`, a path into the app's own cache directory, and three
// create screens stored it and posted it as though it were a photograph the
// server could see.
//
// These tests pin the properties that make the difference between an upload
// pipeline and a plausible-looking one.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  attachMedia,
  attachMediaInOrder,
  createSignedUrl,
  fetchMediaCapabilities,
  guessMimeType,
  toFormData,
  uploadDirect,
} from '../media-api';
import { toLocalFile } from '@/hooks/media';
import type { LocalFile } from '@/types/media';

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

const FILE: LocalFile = {
  uri: 'file:///var/mobile/Containers/Data/tmp/IMG_0042.jpg',
  name: 'IMG_0042.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 812_004,
};

const ASSET = {
  mediaId: '9f2b8c14-3a5e-4d21-8c77-1b0d5e6a4f33',
  kind: 'image',
  status: 'processing',
  visibility: 'public',
  contentType: 'image/jpeg',
  fileName: 'IMG_0042.jpg',
  sizeBytes: 812_004,
  url: '/api/v1/media/9f2b8c14-3a5e-4d21-8c77-1b0d5e6a4f33/content',
  thumbnailUrl: null,
  metadata: {},
  variants: [],
  altText: null,
  caption: null,
  reference: null,
  scanStatus: 'skipped',
  requiresSignedAccess: false,
  createdAt: '2026-08-17T10:00:00.000Z',
};

// ── The route, and the shape it reads ────────────────────────────────────────

describe('the direct upload', () => {
  it('posts to /media/uploads/direct', async () => {
    api.onPost('/media/uploads/direct').reply(201, envelope(ASSET));

    await uploadDirect(FILE);

    expect(api.history.post[0].url).toBe('/media/uploads/direct');
  });

  it('builds the form the route reads', () => {
    // Asserted against the builder rather than against `history.data`, because
    // axios picks its adapter from the runtime: React Native's XHR adapter hands
    // a `FormData` to the bridge untouched, and the one Jest runs under
    // serialises it. Asserting on the request body here would test the test
    // environment.
    //
    // `POST /media/uploads/direct` reads a form and takes `form.Files[0]` plus
    // the fields `kind`, `ownerType`, `ownerId` and `role`. A JSON body answers
    // `UploadEmpty` — the route checks `HasFormContentType` before anything else.
    const form = toFormData(FILE, 'image', null);

    expect(form.get('kind')).toBe('image');
    // React Native's FormData takes `{ uri, name, type }` for a file rather than
    // a Blob, and streams it from the path.
    expect(form.get('file')).toBeTruthy();
  });

  it('names the owner in the form when there is one', () => {
    const form = toFormData(FILE, 'image', {
      ownerType: 'userProfile',
      ownerId: '2c1f8e90-6b44-4a17-9d55-3e8a0c7b1122',
      role: 'avatar',
    });

    expect(form.get('ownerType')).toBe('userProfile');
    expect(form.get('role')).toBe('avatar');
  });

  it('sends the body as a form rather than letting axios turn it into JSON', async () => {
    api.onPost('/media/uploads/direct').reply(201, envelope(ASSET));

    await uploadDirect(FILE);

    // ── This test replaces one that asserted the opposite ─────────────────
    //
    // It used to read `media-api.ts` off disk and assert the string
    // `'Content-Type': 'multipart/form-data'` did **not** appear in it, on the
    // reasoning that axios would set the header with its own boundary. That
    // reasoning ignored `apiClient`'s instance default of `application/json`,
    // and pinned the exact line that made every upload in the application fail.
    //
    // Axios's `transformRequest` resolves the content type *before* it looks at
    // the body, and its `FormData` branch is
    // `hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data`. With
    // the JSON default in force the form was flattened to
    // `{"file":"[object Object]","kind":"image"}` and sent as JSON — which on
    // the server is `HasFormContentType == false`, the first line of
    // `POST /media/uploads/direct`, answered with `media.upload.empty`:
    // "The file is empty."
    //
    // So the property worth pinning is behavioural, and it is not a source
    // string: whatever the runtime, the body that reaches the adapter must
    // still be a form. Asserting that catches the regression in the only place
    // it can be observed, and it does not care which `FormData` this
    // environment provides.
    const sent: unknown = api.history.post[0].data;

    expect(typeof sent).not.toBe('string');
    expect(sent).toBeInstanceOf(FormData);

    // Named, not hand-written with a boundary. React Native's networking layer
    // appends `; boundary=…` to the declared type when the body is a form —
    // which is the mechanism the replaced comment was reaching for and
    // attributed to axios.
    expect(String(api.history.post[0].headers?.['Content-Type'])).toContain('multipart/form-data');
  });

  it('returns the asset the bytes became', async () => {
    api.onPost('/media/uploads/direct').reply(201, envelope(ASSET));

    const asset = await uploadDirect(FILE);

    // The identifier is what every business module stores. `url` is a route
    // into Media minted at read time — storing one would defeat the design and
    // break the moment an asset's visibility changed.
    expect(asset.mediaId).toBe('9f2b8c14-3a5e-4d21-8c77-1b0d5e6a4f33');
  });

  it('reports progress as a fraction while bytes are moving', async () => {
    api.onPost('/media/uploads/direct').reply(201, envelope(ASSET));

    const seen: number[] = [];
    await uploadDirect(FILE, { onProgress: (f) => seen.push(f) });

    // Never above 1. A caller renders a bar from this, and a fraction over one
    // is a bar that overflows its track.
    expect(seen.every((f) => f >= 0 && f <= 1)).toBe(true);
  });

  it('omits the owner entirely when there is none', () => {
    const form = toFormData(FILE, 'image', null);

    // A create screen has no owner id yet — the listing does not exist. Sending
    // `ownerId: ''` would be a model-binding failure on a field the route treats
    // as optional, and `ownerType: 'unassigned'` would be the client asserting
    // something the server decides.
    expect(form.get('ownerId')).toBeNull();
    expect(form.get('ownerType')).toBeNull();
  });
});

// ── Uploading is not attaching ───────────────────────────────────────────────

describe('claiming an asset', () => {
  it('attaches by reference, never by URL', async () => {
    api.onPost('/media/attachments').reply(200, envelope(ASSET));

    await attachMedia({
      mediaId: ASSET.mediaId,
      ownerType: 'housingListing',
      ownerId: '2c1f8e90-6b44-4a17-9d55-3e8a0c7b1122',
      role: 'cover',
    });

    const body = JSON.parse(api.history.post[0].data);
    expect(body.mediaId).toBe(ASSET.mediaId);
    expect(body.ownerType).toBe('housingListing');
    // An asset nobody claims is one the sweeper removes within a day — which is
    // the platform telling you, rather than a storage bill telling you in a year.
    expect(body.role).toBe('cover');
  });

  it('attaches a gallery in the member’s order, one at a time', async () => {
    api.onPost('/media/attachments').reply(200, envelope(ASSET));

    await attachMediaInOrder(['a', 'b', 'c'], {
      ownerType: 'marketplaceListing',
      ownerId: '2c1f8e90-6b44-4a17-9d55-3e8a0c7b1122',
      role: 'gallery',
    });

    const positions = api.history.post.map((call) => JSON.parse(call.data).position);
    // Sequential rather than concurrent, because `position` is the point:
    // firing six attachments at once and letting the server order them by
    // arrival gives the member a different gallery each time they try.
    expect(positions).toEqual([0, 1, 2]);
    expect(api.history.post.map((call) => JSON.parse(call.data).mediaId)).toEqual(['a', 'b', 'c']);
  });
});

// ── Capabilities are read, not assumed ───────────────────────────────────────

describe('capabilities', () => {
  it('reads the deployment’s own limits', async () => {
    api.onGet('/media/capabilities').reply(
      200,
      envelope({
        maxUploadBytes: { image: 10_485_760 },
        directUploadCeilingBytes: 5_242_880,
        chunkSizeBytes: 1_048_576,
        sessionLifetimeHours: 24,
        maxConcurrentUploads: 3,
        acceptedContentTypes: { image: ['image/jpeg', 'image/png'] },
        availableVariants: [],
        supportedOperations: {},
        malwareScanningEnabled: false,
        resumableUploads: true,
        signedUrlLifetimeSeconds: 900,
      })
    );

    const capabilities = await fetchMediaCapabilities();

    // A client that hardcodes the ceiling lets a member upload 400 MB before
    // finding out. A client that assumes scanning shows a safety badge it has
    // not earned — `malwareScanningEnabled: false` is a real deployment state
    // and no amount of reading the code from outside would reveal it.
    expect(capabilities.directUploadCeilingBytes).toBe(5_242_880);
    expect(capabilities.malwareScanningEnabled).toBe(false);
  });
});

// ── Signed links ─────────────────────────────────────────────────────────────

describe('signed access', () => {
  it('mints a link per read rather than storing one', async () => {
    api
      .onPost(`/media/${ASSET.mediaId}/signed-url`)
      .reply(200, envelope({ url: 'https://…/signed', expiresAt: '2026-08-17T10:15:00.000Z' }));

    const signed = await createSignedUrl(ASSET.mediaId);

    // Short-lived and minted against the reader. A signed URL in a database is
    // a credential with an expiry nobody is watching.
    expect(signed.expiresAt).toBeTruthy();
  });
});

// ── The picker boundary ──────────────────────────────────────────────────────

describe('reading a picker result', () => {
  it('falls back to the URI’s last segment when the picker gives no name', () => {
    const file = toLocalFile({ uri: 'file:///tmp/IMG_0042.HEIC' });

    // Better than a constant: the last segment usually carries the extension,
    // which is what the MIME guess reads.
    expect(file.name).toBe('IMG_0042.HEIC');
    expect(file.mimeType).toBe('image/heic');
  });

  it('strips a query string before reading the extension', () => {
    const file = toLocalFile({ uri: 'file:///tmp/photo.png?width=200' });

    expect(file.name).toBe('photo.png');
    expect(file.mimeType).toBe('image/png');
  });

  it('prefers the picker’s own mime type where it has one', () => {
    const file = toLocalFile({ uri: 'file:///tmp/x', fileName: 'x', mimeType: 'image/webp' });

    expect(file.mimeType).toBe('image/webp');
  });

  it('guesses rather than sending application/octet-stream', () => {
    // `MediaContentType.TryCreate` refuses a blank type, and an octet-stream
    // would be refused for an image kind — so the member would be told their
    // photograph is not a photograph.
    expect(guessMimeType('scan.pdf')).toBe('application/pdf');
    expect(guessMimeType('clip.mov')).toBe('video/quicktime');
    expect(guessMimeType('no-extension')).toBe('image/jpeg');
  });
});
