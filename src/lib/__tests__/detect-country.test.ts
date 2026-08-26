// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Which country is this device actually in?
//
// ── The defect these tests are the memory of ─────────────────────────────────
//
// `store/location.ts` answered this with a `setTimeout(800)` that resolved to a
// literal — Peckham, London — and set `permissionStatus: 'granted'` without
// asking anybody. Its default was Rose Hill, Mauritius.
//
// `choose-country.tsx` compared a member's stated country of residence against
// that constant and refused registration on a mismatch, under a heading reading
// *"Diaspora requires matching physical GPS telemetry with your declared
// residence."* Only a member who selected Mauritius — or the United Kingdom,
// once "detection" had run — could pass, and they passed from anywhere.
//
// ── The property that matters most ───────────────────────────────────────────
//
// "Somewhere else" and "I could not tell" are different answers. Collapsing them
// turns a declined permission into an accusation, which is what comparing
// against a default location did. Several tests below exist only to keep those
// two apart.
// ─────────────────────────────────────────────────────────────────────────────

import {
  detectCountry,
  setSimulatedCountry,
  getSimulatedCountry,
} from '@/lib/location/detect-country';

const mockPermission = { request: jest.fn(), check: jest.fn(), areServicesEnabled: jest.fn(), openSettings: jest.fn() };
const mockDevice = { getCurrentPosition: jest.fn(), watchPosition: jest.fn() };

jest.mock('@/lib/maps/providers/device-location', () => ({
  resolveLocationPermissionProvider: () => mockPermission,
  resolveDeviceLocationProvider: () => mockDevice,
}));

const mockReverseGeocodeAsync = jest.fn();

// Virtual: `expo-location` is a native module and does not load under Jest. The
// module under test requires it lazily and tolerates its absence, so the mock is
// what exercises the path that matters on a device.
jest.mock('expo-location', () => ({ reverseGeocodeAsync: mockReverseGeocodeAsync }), {
  virtual: true,
});

/**
 * A permission state, on both doors.
 *
 * `detectCountry` reads through `check()` by default and `request()` only when
 * a member pressed something, so a helper that stubbed one would make every
 * test depend on which door the implementation happened to use that week.
 */
function permissionIs(status: string, accuracy: string) {
  const state = { status, accuracy, canOpenSettings: true, checkedAt: null };

  mockPermission.check.mockResolvedValue(state);
  mockPermission.request.mockResolvedValue(state);
}

/** A granted permission of the given kind. */
function granted(status: 'granted' | 'grantedApproximate') {
  permissionIs(status, 'precise');
}

function refused() {
  permissionIs('denied', 'none');
}

/** A successful fix at the given coordinate. */
function fixAt(latitude: number, longitude: number) {
  mockDevice.getCurrentPosition.mockResolvedValue({
    ok: true,
    value: { coordinate: { latitude, longitude }, timestamp: 0, source: 'device' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setSimulatedCountry(null);
});

describe('when the device can answer', () => {
  it('reports the ISO code, upper-cased', async () => {
    granted('granted');
    fixAt(6.5244, 3.3792);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'ng', country: 'Nigeria', city: 'Lagos' }]);

    const detection = await detectCountry();

    expect(detection).toMatchObject({ status: 'detected', countryCode: 'NG' });
  });

  it('carries the display name separately from the code', async () => {
    // The old check compared display names, so a device set to French measured
    // "Royaume-Uni" against "United Kingdom" and refused a member standing in
    // London. The name is for rendering; the code is for deciding.
    granted('granted');
    fixAt(51.5, -0.12);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'GB', country: 'Royaume-Uni' }]);

    const detection = await detectCountry();

    expect(detection).toMatchObject({ status: 'detected', countryCode: 'GB', countryName: 'Royaume-Uni' });
  });

  it('accepts an approximate grant, which is ample for a country', async () => {
    // Android 12+ offers coarse location first, accurate to one to three
    // kilometres. Treating that as a refusal would block registration for
    // everybody who took the option the system suggests.
    granted('grantedApproximate');
    fixAt(6.5244, 3.3792);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'NG' }]);

    await expect(detectCountry()).resolves.toMatchObject({ status: 'detected', countryCode: 'NG' });
  });
});

describe('when the device cannot answer', () => {
  it('reports a refusal as a refusal, not as a different country', async () => {
    // The single most important distinction here. A declined permission says
    // nothing about where somebody is, and the screen that consumes this must
    // not be able to read it as a mismatch.
    refused();

    const detection = await detectCountry();

    expect(detection).toEqual({ status: 'permission-denied' });
    expect(mockDevice.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('reports a failed fix as unavailable', async () => {
    granted('granted');
    mockDevice.getCurrentPosition.mockResolvedValue({
      ok: false,
      error: 'position-unavailable',
      detail: 'No signal.',
      retryable: true,
    });

    await expect(detectCountry()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('reports a position that resolves to no country as unavailable', async () => {
    // Some regions answer with a street and no ISO code. Inferring one from the
    // display name would be a guess presented as a measurement.
    granted('granted');
    fixAt(0, 0);
    mockReverseGeocodeAsync.mockResolvedValue([{ country: 'Somewhere', isoCountryCode: null }]);

    await expect(detectCountry()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('reports an empty geocode result as unavailable', async () => {
    granted('granted');
    fixAt(0, 0);
    mockReverseGeocodeAsync.mockResolvedValue([]);

    await expect(detectCountry()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('survives the lookup throwing', async () => {
    granted('granted');
    fixAt(6.5, 3.3);
    mockReverseGeocodeAsync.mockRejectedValue(new Error('geocoder is down'));

    await expect(detectCountry()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('survives the permission prompt throwing', async () => {
    mockPermission.request.mockRejectedValue(new Error('no activity'));

    await expect(detectCountry()).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('never answers `detected` without a country code', async () => {
    // The property every caller depends on: a `detected` result always carries
    // something to compare. Asserted across every failure shape at once.
    const failures = [
      () => refused(),
      () => {
        granted('granted');
        mockDevice.getCurrentPosition.mockResolvedValue({ ok: false, error: 'timeout', retryable: true });
      },
      () => {
        granted('granted');
        fixAt(1, 1);
        mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: '   ' }]);
      },
    ];

    for (const arrange of failures) {
      jest.clearAllMocks();
      arrange();

      const detection = await detectCountry();
      expect(detection.status).not.toBe('detected');
    }
  });
});

describe('the developer spoof', () => {
  it('forces the detected country without touching the device', async () => {
    setSimulatedCountry('ng');

    const detection = await detectCountry();

    expect(detection).toMatchObject({ status: 'detected', countryCode: 'NG' });
    expect(mockPermission.request).not.toHaveBeenCalled();
    expect(mockDevice.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('clears back to asking the device', async () => {
    setSimulatedCountry('NG');
    setSimulatedCountry(null);

    granted('granted');
    fixAt(51.5, -0.12);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'GB' }]);

    await expect(detectCountry()).resolves.toMatchObject({ countryCode: 'GB' });

    // The point is that the device was consulted again, not which door was
    // used — the default path reads the grant rather than prompting for it.
    expect(mockDevice.getCurrentPosition).toHaveBeenCalled();
  });

  it('is readable, so a screen can show what it is forcing', () => {
    setSimulatedCountry('gb');
    expect(getSimulatedCountry()).toBe('GB');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A permission prompt is something a member asked for
//
// `LocationPermissionProvider.request` says so in its own doc comment: "Only
// ever called from an explicit member action." The first version of
// `detectCountry` called it unconditionally, and `choose-country.tsx` calls
// `detectCountry` from a mount effect — so navigating to a screen would have
// raised the system dialogue. That is the pattern that teaches people to press
// Deny without reading.
// ─────────────────────────────────────────────────────────────────────────────

describe('prompting', () => {
  it('reads the existing grant without asking, by default', async () => {
    mockPermission.check.mockResolvedValue({
      status: 'granted',
      accuracy: 'precise',
      canOpenSettings: true,
      checkedAt: null,
    });
    fixAt(6.5, 3.3);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'NG' }]);

    await expect(detectCountry()).resolves.toMatchObject({ countryCode: 'NG' });

    expect(mockPermission.check).toHaveBeenCalled();
    expect(mockPermission.request).not.toHaveBeenCalled();
  });

  it('asks only when the caller says a member pressed something', async () => {
    granted('granted');
    fixAt(6.5, 3.3);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'NG' }]);

    await detectCountry({ prompt: true });

    expect(mockPermission.request).toHaveBeenCalled();
    expect(mockPermission.check).not.toHaveBeenCalled();
  });

  it('an ungranted silent read is a refusal, not a mismatch', async () => {
    // A member who has not been asked yet must not be told their residency
    // failed verification.
    mockPermission.check.mockResolvedValue({
      status: 'notRequested',
      accuracy: 'none',
      canOpenSettings: true,
      checkedAt: null,
    });

    await expect(detectCountry()).resolves.toEqual({ status: 'permission-denied' });
  });
});
