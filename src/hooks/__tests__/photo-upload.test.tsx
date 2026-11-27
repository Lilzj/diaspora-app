/**
 * usePhotoUpload: one photograph, chosen and uploaded (FARCH-007, 27 Nov 2026).
 *
 * Three screens picked a photograph their own way and the home edit screen a
 * fourth. The hook asks camera or gallery through the shared chooser, uploads
 * through the media pipeline, and hands the screen a photograph only once the
 * platform holds it: a failed upload, or a member who backed out, hands over
 * nothing, so nothing can sit in a grid looking like a photograph the platform
 * never received.
 */
import { act, renderHook } from '@testing-library/react-native';

const mockShowAlert = jest.fn();
jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: mockShowAlert, showToast: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  CameraType: { front: 'front', back: 'back' },
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

interface MockUpload {
  upload: jest.Mock;
  isUploading: boolean;
  phase: 'idle' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
}

const mockUpload: MockUpload = { upload: jest.fn(), isUploading: false, phase: 'idle', progress: 0, error: null };
jest.mock('@/hooks/media', () => ({
  ...jest.requireActual('@/hooks/media'),
  useMediaUpload: () => mockUpload,
}));

import * as ImagePicker from 'expo-image-picker';
import { usePhotoUpload } from '../photo-upload';
import type { ChosenPhoto } from '@/types/media';

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const ASSET = { uri: 'file:///cache/photo.jpg', width: 1200, height: 900, fileName: 'photo.jpg', mimeType: 'image/jpeg' };

/** Presses one of the chooser's buttons, as the member would. */
function press(label: string) {
  const options = mockShowAlert.mock.calls.at(-1)?.[0] as { buttons: { text: string; onPress?: () => void }[] };
  const button = options.buttons.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`no "${label}" button`);
  button.onPress();
}

/** Lets the permission, the picker and the upload settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockUpload, { isUploading: false, phase: 'idle', progress: 0, error: null });
  picker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
  picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
});

it('asks camera or gallery under the screen’s own title, and starts nothing until a source is chosen', () => {
  const { result } = renderHook(() => usePhotoUpload('Select Cover Image'));

  act(() => result.current.choose(jest.fn()));

  const options = mockShowAlert.mock.calls[0][0] as { title: string; buttons: { text: string }[] };
  expect(options.title).toBe('Select Cover Image');
  expect(options.buttons.map((button) => button.text)).toEqual(['Take photo', 'Choose from gallery', 'Cancel']);
  expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(picker.launchCameraAsync).not.toHaveBeenCalled();
});

it('hands over a photograph only once the platform holds it', async () => {
  mockUpload.upload.mockResolvedValue({ mediaId: 'media-1', thumbnailUrl: null });
  const onPhoto = jest.fn<void, [ChosenPhoto]>();
  const { result } = renderHook(() => usePhotoUpload('Add a photo'));

  act(() => result.current.choose(onPhoto));
  press('Choose from gallery');
  await settle();

  expect(mockUpload.upload).toHaveBeenCalledWith(expect.objectContaining({ uri: ASSET.uri }));
  // The device's copy is the preview until the platform has a rendition of its own.
  expect(onPhoto).toHaveBeenCalledWith({ mediaId: 'media-1', previewUri: ASSET.uri });
});

it('shows the platform’s own rendition once it has one', async () => {
  mockUpload.upload.mockResolvedValue({ mediaId: 'media-2', thumbnailUrl: 'https://media.example/thumb.jpg' });
  const onPhoto = jest.fn<void, [ChosenPhoto]>();
  const { result } = renderHook(() => usePhotoUpload('Add a photo'));

  act(() => result.current.choose(onPhoto));
  press('Take photo');
  await settle();

  expect(picker.launchCameraAsync).toHaveBeenCalledTimes(1);
  expect(onPhoto).toHaveBeenCalledWith({ mediaId: 'media-2', previewUri: 'https://media.example/thumb.jpg' });
});

it('hands over nothing when the upload fails', async () => {
  mockUpload.upload.mockResolvedValue(null);
  const onPhoto = jest.fn();
  const { result } = renderHook(() => usePhotoUpload('Add a photo'));

  act(() => result.current.choose(onPhoto));
  press('Choose from gallery');
  await settle();

  expect(mockUpload.upload).toHaveBeenCalledTimes(1);
  expect(onPhoto).not.toHaveBeenCalled();
});

it('hands over nothing, and uploads nothing, when the member backs out', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
  const onPhoto = jest.fn();
  const { result } = renderHook(() => usePhotoUpload('Add a photo'));

  act(() => result.current.choose(onPhoto));
  press('Choose from gallery');
  await settle();

  expect(mockUpload.upload).not.toHaveBeenCalled();
  expect(onPhoto).not.toHaveBeenCalled();
});

it('hands over nothing, and uploads nothing, when the gallery is refused', async () => {
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  const onPhoto = jest.fn();
  const { result } = renderHook(() => usePhotoUpload('Add a photo'));

  act(() => result.current.choose(onPhoto));
  press('Choose from gallery');
  await settle();

  expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(mockUpload.upload).not.toHaveBeenCalled();
  expect(onPhoto).not.toHaveBeenCalled();
});

describe('what the drop zone says', () => {
  it('counts an upload in progress', () => {
    Object.assign(mockUpload, { isUploading: true, phase: 'uploading', progress: 0.42 });
    const { result } = renderHook(() => usePhotoUpload('Add a photo'));

    expect(result.current.dropZone).toEqual({ busy: true, busyLabel: 'Uploading 42%', error: null });
  });

  it('says processing as a different wait from uploading', () => {
    Object.assign(mockUpload, { isUploading: true, phase: 'processing', progress: 1 });
    const { result } = renderHook(() => usePhotoUpload('Add a photo'));

    expect(result.current.dropZone.busyLabel).toBe('Processing…');
  });

  it('gives the server’s own sentence when the upload was refused, and none otherwise', () => {
    Object.assign(mockUpload, { phase: 'failed', error: 'That file is larger than 10 MB.' });
    const failed = renderHook(() => usePhotoUpload('Add a photo'));
    expect(failed.result.current.dropZone.error).toBe('That file is larger than 10 MB.');

    Object.assign(mockUpload, { phase: 'ready', error: 'stale' });
    const ready = renderHook(() => usePhotoUpload('Add a photo'));
    expect(ready.result.current.dropZone.error).toBeNull();
  });
});
