// ─────────────────────────────────────────────────────────────────────────────
// Photos are sent at a size worth sending — 21 Sep 2026
//
// `ImagePicker` was asked for `quality: 0.8` and that was treated as the whole
// story. It is not: `quality` applies when the picker encodes a JPEG, is
// ignored for a PNG — which is lossless — and resizes nothing either way. Every
// asset uploaded to production before this was a full-size PNG, and a real
// camera photo would have gone up at several megabytes at four to six thousand
// pixels across.
//
// That matters because Kestrel refuses a request body arriving under
// `MinRequestBodyDataRate` — 240 bytes a second after a five second grace —
// with a 408, and this platform has been watched doing it: a 28KB body refused
// minutes after a 187KB one managed 3KB/s over the same link. Fewer bytes is
// the difference between an upload that finishes and one that does not.
//
// The shrink is deliberately forgiving: a photo that cannot be re-encoded is
// uploaded as it came. Refusing the upload would let the shrinking step decide
// what a member is allowed to post.
// ─────────────────────────────────────────────────────────────────────────────

const mockManipulate = jest.fn();
const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();

// **Not `{ virtual: true }`, and that is not a detail.** `expo-image-manipulator`
// is a real dependency, and declaring a mock virtual tells jest the module does
// not exist. When it does, the registration lands beside the real resolution
// rather than in front of it, and `jest-expo` — which mocks every Expo native
// module of its own accord — sometimes won: `manipulate` was still a function,
// so nothing threw, but it was *their* function, `mockManipulate` recorded
// nothing, and the context it returned had no `resize`. Two of these four tests
// then failed in about one run in three, and only in a run large enough to be
// worth the flake. A plain mock is deterministic.
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { uploadDirect } from '../media-api';
import type { LocalFile } from '@/types/media';

/** The bytes that actually left, captured from the fake transport. */
let sent: { uri: string; name: string; mimeType: string } | null = null;

const WAS_DEV = (global as { __DEV__?: boolean }).__DEV__;
const OriginalXhr = (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest;
const OriginalFormData = (global as unknown as { FormData: unknown }).FormData;

afterEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = WAS_DEV;
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = OriginalXhr;
  (global as unknown as { FormData: unknown }).FormData = OriginalFormData;
});

beforeEach(() => {
  // **`__DEV__` false, or this silently tests the mock transport.** The upload
  // splits on `areSimulatedFeaturesEnabled()`, and under jest that is true. The
  // first version of this file went through axios and died on a FormData axios
  // cannot serialise, which is the trap `media-upload.test.ts` documents.
  (global as { __DEV__?: boolean }).__DEV__ = false;
  sent = null;
  jest.clearAllMocks();

  // **React Native's `FormData`, not jsdom's.** They disagree about a file:
  // React Native keeps the `{ uri, name, type }` object and writes it into the
  // multipart body, and jsdom — which is what `jest-expo` supplies — accepts
  // only a Blob and coerces anything else with `String()`, so `get('file')`
  // comes back as the literal `[object Object]`. Standing in the phone's
  // polyfill is the only way to see which file was chosen; reading jsdom's
  // would be reading an artefact of the test environment.
  class RecordingFormData {
    _parts: [string, unknown][] = [];

    append(key: string, value: unknown) {
      this._parts.push([key, value]);
    }
  }

  (global as unknown as { FormData: unknown }).FormData = RecordingFormData;

  mockResize.mockReturnValue(undefined);
  mockSaveAsync.mockResolvedValue({ uri: 'file:///tmp/shrunk.jpg' });
  mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
  mockManipulate.mockReturnValue({ resize: mockResize, renderAsync: mockRenderAsync });

  // A transport that records the file rather than moving it. The multipart
  // details are covered by `media-upload.test.ts`; this file is only about
  // which bytes are chosen.
  class RecordingXhr {
    status = 201;
    responseText = JSON.stringify({ data: { mediaId: 'm-1' } });
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send(body: { _parts?: [string, unknown][] }) {
      const part = body?._parts?.find(([key]) => key === 'file');
      const value = part?.[1] as { uri: string; name: string; type: string } | undefined;
      if (value) sent = { uri: value.uri, name: value.name, mimeType: value.type };
      this.onload?.();
    }
  }

  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = RecordingXhr;
});

const photo: LocalFile = {
  uri: 'file:///tmp/DSC_0001.png',
  name: 'DSC_0001.png',
  mimeType: 'image/png',
  sizeBytes: 4_812_004,
};

describe('a photo on its way to the platform', () => {
  it('is resized and re-encoded, not sent as it came off the camera', async () => {
    await uploadDirect(photo);

    expect(mockManipulate).toHaveBeenCalledWith(photo.uri);
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });

    expect(sent).toEqual({
      uri: 'file:///tmp/shrunk.jpg',
      name: 'DSC_0001.jpg',
      mimeType: 'image/jpeg',
    });
  });

  /**
   * The name and type follow the bytes. A JPEG posted as `.png` is a file whose
   * extension disagrees with its content, and the platform reads both.
   */
  it('renames to match what it actually encoded', async () => {
    await uploadDirect({ ...photo, uri: 'file:///tmp/a.b.heic', name: 'a.b.heic' });

    expect(sent?.name).toBe('a.b.jpg');
    expect(sent?.mimeType).toBe('image/jpeg');
  });

  it('is sent unchanged when it cannot be re-encoded', async () => {
    mockRenderAsync.mockRejectedValue(new Error('no decoder'));

    await uploadDirect(photo);

    expect(sent).toEqual({
      uri: photo.uri,
      name: photo.name,
      mimeType: photo.mimeType,
    });
  });

  it('leaves anything that is not an image alone', async () => {
    const document: LocalFile = {
      uri: 'file:///tmp/lease.pdf',
      name: 'lease.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 90_000,
    };

    await uploadDirect(document, { kind: 'document' });

    expect(mockManipulate).not.toHaveBeenCalled();
    expect(sent?.name).toBe('lease.pdf');
  });
});
