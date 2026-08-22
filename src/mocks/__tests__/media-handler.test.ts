// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the /media development handler (Remediation Wave E)
//
// These tests exist for one reason: the handler's value is entirely in the
// refusals it reproduces, and a refusal nobody exercises is a comment.
//
// They assert what the handler *enforces*, not what the client hopes for — the
// same distinction the handler's own header draws. Nothing here reaches into a
// `FormData`'s internals, because the whole point of the reading code is that
// its shape differs between React Native, Node and the web.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupMediaMocks } from '../handlers/media';
import { fetchMediaAsset, fetchMediaCapabilities, uploadDirect } from '@/lib/media-api';
import type { LocalFile } from '@/types/media';

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
  setupMediaMocks(api);
});

afterEach(() => {
  api.restore();
});

const FILE: LocalFile = {
  uri: 'file:///var/mobile/Containers/Data/tmp/IMG_0042.jpg',
  name: 'IMG_0042.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 812_004,
};

describe('capabilities', () => {
  it('reports the deployment as it actually is, not as a client would like it', async () => {
    const capabilities = await fetchMediaCapabilities();

    // No `IVirusScanner` implementation exists in the backend solution, so
    // `MediaProcessorRegistry.HasScanner` is false.
    expect(capabilities.malwareScanningEnabled).toBe(false);

    // No image codec is registered either — `AvailableVariants()` asks
    // `Supports(Image, GenerateThumbnails)` and gets false.
    expect(capabilities.availableVariants).toEqual([]);

    // `MediaUploadOptions.DirectUploadCeilingMegabytes`, in binary megabytes.
    expect(capabilities.directUploadCeilingBytes).toBe(8 * 1024 * 1024);

    // `MediaLimits.MaxSizeFor(VerificationDocument)` — the number the client
    // already publishes on screen.
    expect(capabilities.maxUploadBytes.verificationDocument).toBe(5 * 1024 * 1024);
  });
});

describe('the direct upload', () => {
  it('refuses a body that is not a form, as HasFormContentType does', async () => {
    const response = await apiClient
      .post('/media/uploads/direct', { kind: 'image' })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    expect(response?.status).toBe(400);
    expect(response?.data?.code).toBe('media.upload.empty');
  });

  it('accepts a multipart upload and answers an asset that is not yet ready', async () => {
    const asset = await uploadDirect(FILE);

    // `MediaAsset` is constructed Pending. On a deployment that processes on the
    // worker rather than inline, that is what the upload response carries.
    expect(asset.status).toBe('pending');

    // `skipped` is not `clean`: nothing looked at the file.
    expect(asset.scanStatus).toBe('skipped');

    // `MediaLimits.DefaultVisibilityFor` returns Private for every kind, and
    // nothing in the create flow widens it.
    expect(asset.visibility).toBe('private');
    expect(asset.requiresSignedAccess).toBe(true);

    // A route into Media, never a provider URL.
    expect(asset.url).toContain(`/api/v1/media/${asset.mediaId}/content`);

    // No codec, so no rendition.
    expect(asset.thumbnailUrl).toBeNull();
    expect(asset.variants).toEqual([]);
  });

  it('refuses a kind the platform does not have', async () => {
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'a.jpg');
    form.append('kind', 'photograph');

    const response = await apiClient
      // The content type is named for the same reason `uploadDirect` names it:
      // `apiClient`'s instance default is `application/json`, and axios's
      // `transformRequest` serialises a form to JSON when it sees one.
      .post('/media/uploads/direct', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    expect(response?.status).toBe(400);
    expect(response?.data?.code).toBe('media.upload.type-not-allowed');
  });

  it('refuses an over-ceiling upload where the size is knowable', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(9 * 1024 * 1024)], { type: 'image/jpeg' }),
      'huge.jpg'
    );

    const response = await apiClient
      // The content type is named for the same reason `uploadDirect` names it:
      // `apiClient`'s instance default is `application/json`, and axios's
      // `transformRequest` serialises a form to JSON when it sees one.
      .post('/media/uploads/direct', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    expect(response?.status).toBe(400);
    expect(response?.data?.code).toBe('media.upload.too-large');
  });
});

describe('the asset lifecycle', () => {
  it('advances pending → processing → ready, so the client poll terminates', async () => {
    const uploaded = await uploadDirect(FILE);
    expect(uploaded.status).toBe('pending');

    expect((await fetchMediaAsset(uploaded.mediaId)).status).toBe('processing');
    expect((await fetchMediaAsset(uploaded.mediaId)).status).toBe('ready');
  });

  it('answers 404 for an identifier the route would not even bind', async () => {
    // Every asset route is `{mediaId:guid}`. `'user-123'` matches no route.
    const response = await apiClient
      .get('/media/user-123')
      .catch((error: { response?: { status?: number } }) => error.response);

    expect(response?.status).toBe(404);
  });
});

describe('signed links', () => {
  it('refuses a variant this deployment cannot produce', async () => {
    const uploaded = await uploadDirect(FILE);

    const response = await apiClient
      .post(`/media/${uploaded.mediaId}/signed-url`, { variant: 'thumbnail' })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    // Consistent with `availableVariants: []` above. A handler that minted one
    // would be advertising a rendition the platform cannot make.
    expect(response?.status).toBe(404);
    expect(response?.data?.code).toBe('media.variant.not-found');
  });
});

describe('attachments', () => {
  it('normalises the role to a lowercase slug, as MediaReference does', async () => {
    const uploaded = await uploadDirect(FILE);

    const response = await apiClient.post('/media/attachments', {
      mediaId: uploaded.mediaId,
      ownerType: 'housingListing',
      ownerId: '3f1c9a20-58d4-4a13-9d8e-2b6f0c7a5e11',
      role: 'Cover',
      position: 0,
    });

    expect(response.data.data.reference.role).toBe('cover');
  });

  it('refuses a re-attach to a different owner', async () => {
    const uploaded = await uploadDirect(FILE);

    await apiClient.post('/media/attachments', {
      mediaId: uploaded.mediaId,
      ownerType: 'housingListing',
      ownerId: '3f1c9a20-58d4-4a13-9d8e-2b6f0c7a5e11',
      role: 'Cover',
    });

    const response = await apiClient
      .post('/media/attachments', {
        mediaId: uploaded.mediaId,
        ownerType: 'marketplaceListing',
        ownerId: '9d2e7b41-6c05-4f88-b3a7-1e4c8d0f2a63',
        role: 'Cover',
      })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    expect(response?.status).toBe(403);
    expect(response?.data?.code).toBe('media.asset.ownership-required');
  });

  it('refuses a half-specified owner, which is what a non-GUID ownerId becomes', async () => {
    const uploaded = await uploadDirect(FILE);

    const response = await apiClient
      .post('/media/attachments', {
        mediaId: uploaded.mediaId,
        ownerType: 'housingListing',
        ownerId: 'user-123',
        role: 'Cover',
      })
      .catch((error: { response?: { status?: number; data?: { code?: string } } }) => error.response);

    expect(response?.status).toBe(400);
    expect(response?.data?.code).toBe('media.reference.owner-invalid');
  });
});
