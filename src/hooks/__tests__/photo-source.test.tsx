/**
 * Camera or gallery, everywhere a photo is asked for — Android UAT, 3 Nov 2026.
 *
 * The "Register Hub" logo and cover opened the phone's gallery directly, while
 * other screens asked "Take photo, or choose from gallery". Six screens went
 * straight to the gallery, the shared picker offered the camera only when a
 * screen opted in, and when it did it opened the front (selfie) camera to
 * photograph an item for swap.
 *
 * `usePhotoSource` is the one chooser: it asks, and starts nothing until the
 * member picks (Android's back button closes the dialog without pressing a
 * button, so a chooser that waited on an answer would leave a screen busy).
 * The camera is the back one unless a screen asks for the front.
 */
import React from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';

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

import * as ImagePicker from 'expo-image-picker';
import { usePhotoSource } from '../photo-source';
import { ImagePickerInput } from '@/components/ImagePickerInput';

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const ASSET = { uri: 'file:///cache/photo.jpg', width: 1200, height: 900 };

beforeEach(() => {
  jest.clearAllMocks();
  picker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [ASSET] } as never);
});

function buttonsOfLastAlert() {
  const options = mockShowAlert.mock.calls.at(-1)?.[0];
  return (options?.buttons ?? []) as { text: string; onPress?: () => void; style?: string }[];
}

describe('asking where the photo comes from', () => {
  it('offers the camera, the gallery and a way out', () => {
    const { result } = renderHook(() => usePhotoSource());
    result.current.ask('Add a logo', jest.fn());

    expect(buttonsOfLastAlert().map((button) => button.text)).toEqual(['Take photo', 'Choose from gallery', 'Cancel']);
    expect(buttonsOfLastAlert()[2].style).toBe('cancel');
  });

  it('starts nothing until the member picks, then says which', () => {
    const pick = jest.fn();
    const { result } = renderHook(() => usePhotoSource());
    result.current.ask('Add a logo', pick);

    expect(pick).not.toHaveBeenCalled();
    buttonsOfLastAlert()[0].onPress?.();
    expect(pick).toHaveBeenCalledWith('camera');
  });
});

describe('opening the source', () => {
  it('opens the back camera unless asked otherwise', async () => {
    const { result } = renderHook(() => usePhotoSource());
    const assets = await result.current.launch('camera', { allowsEditing: true });

    expect(assets).toEqual([ASSET]);
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'back' }));
  });

  it('opens the front camera for a selfie', async () => {
    const { result } = renderHook(() => usePhotoSource());
    await result.current.launch('camera', { cameraType: 'front' });

    expect(picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'front' }));
  });

  it('says so and opens nothing when the permission is refused', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    const { result } = renderHook(() => usePhotoSource());

    expect(await result.current.launch('camera', {})).toBeNull();
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Camera permission needed' }));
  });

  it('answers null when the member backs out of the picker', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    const { result } = renderHook(() => usePhotoSource());

    expect(await result.current.launch('library', {})).toBeNull();
  });
});

describe('the shared picker control', () => {
  it('offers the camera by default', () => {
    render(<ImagePickerInput label="Logo" value={null} onChangeImage={jest.fn()} />);
    fireEvent.press(screen.getByTestId('image-picker-input'));

    expect(buttonsOfLastAlert().map((button) => button.text)).toContain('Take photo');
  });
});

describe('no screen opens the gallery on its own', () => {
  const fs = require('fs');
  const path = require('path');

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory(): boolean }) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  // These ask camera or gallery themselves (three create/edit wizards that
  // pick several photos at once, and the chat attachment sheet).
  const ASKS_ITSELF = [
    path.join('hooks', 'photo-source.ts'),
    path.join('app', 'marketplace', 'create.tsx'),
    path.join('app', 'housing', 'create.tsx'),
    path.join('app', 'marketplace', 'edit', '[id].tsx'),
    path.join('components', 'conversation', 'AttachmentPicker.tsx'),
  ];

  it('goes through the chooser everywhere else', () => {
    const root = path.join(process.cwd(), 'src');
    const direct = sourceFiles(root)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('launchImageLibraryAsync'))
      .map((file) => path.relative(root, file))
      .filter((file) => !ASKS_ITSELF.includes(file));

    expect(direct).toEqual([]);
  });
});
