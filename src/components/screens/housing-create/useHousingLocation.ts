// List a home: where it is, and the pin, from the device standing at the property or an address
// the landlord picks. Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import {
  resolveLocationPermissionProvider,
  resolveDeviceLocationProvider,
} from '@/lib/maps/providers/device-location';

export function useHousingLocation() {
  // STEP 3: Location & Landmark
  //
  // The town comes from <TownPicker>, searched in the residence country (14 Oct
  // 2026). It replaced four hard-coded chips — London, Port Louis, Lagos, Accra —
  // offered whatever country the member lived in, with London preselected.
  //
  // The town's own coordinates are deliberately NOT kept: the server stores
  // `latitude`/`longitude` as the property's address, and a town centre is not
  // the property. With no pin the server files the home from the town's name.
  //
  // "Neighborhood / Area" was removed the same day: it duplicated Nearby
  // Landmark, it is not required by the server, and it was posted as
  // `regionName`, which is the region above the town, not a neighbourhood.
  const [cityName, setCityName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  // Sent as `addressLine2`; it used to be collected and sent nowhere.
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);
  // **Null until the landlord gives one, and London never again.**
  //
  // This was `useState({ latitude: 51.4702, longitude: -0.0691 })` — Peckham —
  // and the payload sent it on every listing whether or not the picker was ever
  // opened. Opening it did not help: the picker was a one-second delay that
  // assigned the *city centre* by name, so every Port Louis property came out
  // on the same point. The one created on 21 Sep 2026 stored
  // `-20.164200, 57.502900` and was filed under `/MU/port-louis/…/ward-iv`,
  // which is where the city hall is, not where the flat is.
  //
  // A pin is optional on the server and optional here. An absent pin is honest;
  // a wrong one sends people to the wrong street.
  const [coordinates, setCoordinates] =
    useState<{ latitude: number; longitude: number } | null>(null);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  // Where the pin came from, in words the landlord will recognise: their own
  // position, or the address they picked. Never a guess from the town.
  const [pinSource, setPinSource] = useState<string | null>(null);
  // Set when location was refused, so the step can offer the way back in rather
  // than a sentence that names Settings and no means to open it.
  const [pinOffersSettings, setPinOffersSettings] = useState(false);

  /**
   * The pin, from the device that is standing at the property.
   *
   * **Nothing is guessed.** There are two honest sources: the device standing at
   * the property, and (since 27 Sep 2026) an address the landlord picks from
   * `AddressSearchField`, which resolves through the platform's configured
   * vendor. Inventing a point from the town is what both replaced. The label
   * says which one set the pin.
   */
  const usePinFromDevice = async () => {
    setIsSelectingPin(true);
    setPinProblem(null);
    setPinOffersSettings(false);

    try {
      const permissions = resolveLocationPermissionProvider();

      let state = await permissions.check();

      // Asked only from this tap. §6 forbids prompting on mount.
      if (state.status === 'notRequested' || state.status === 'denied') {
        state = await permissions.request();
      }

      // `grantedApproximate` is accepted rather than refused: a coarse fix is
      // still the landlord's own position, and the alternative on offer is no
      // pin at all. It is named in the confirmation so nobody reads a
      // neighbourhood-sized circle as a doorstep.
      if (state.status !== 'granted' && state.status !== 'grantedApproximate') {
        // A refusal the app can no longer ask past: the only way back is the
        // system's own Settings page, so the step offers a button to it.
        setPinOffersSettings(
          (state.status === 'deniedPermanently' || state.status === 'denied') && state.canOpenSettings
        );
        setPinProblem(
          state.status === 'deniedPermanently'
            ? state.canOpenSettings
              ? 'Location is turned off for Diaspora. Open Settings to turn it on, or post this property without a pin.'
              : 'Location is turned off for Diaspora. You can post this property without a pin.'
            : state.status === 'servicesDisabled'
              ? 'Location services are switched off on this device. You can turn them on, or post this property without a pin.'
              : state.status === 'unavailable'
                ? 'This device cannot report its location. You can post this property without a pin.'
                : 'Diaspora needs your location to set the pin. You can post this property without one.'
        );
        return;
      }

      const position = await resolveDeviceLocationProvider().getCurrentPosition({
        highAccuracy: true,
      });

      if (!position.ok) {
        // Said, not swallowed. A pin that silently fails to set is how the old
        // picker convinced everybody it worked.
        setPinProblem(
          'Diaspora could not read your location just now. You can try again, or post this property without a pin.'
        );
        return;
      }

      setCoordinates({
        latitude: position.value.coordinate.latitude,
        longitude: position.value.coordinate.longitude,
      });
      setPinSource('your current location');

      if (state.status === 'grantedApproximate') {
        setPinProblem(
          'This pin is approximate, because Diaspora only has your rough location. It places the property in the right area rather than on the right street.'
        );
      }
    } finally {
      setIsSelectingPin(false);
    }
  };

  return {
    cityName, setCityName, addressLine, setAddressLine, landmark, setLandmark, isSelectingPin,
    coordinates, setCoordinates, pinProblem, setPinProblem, pinSource, setPinSource,
    pinOffersSettings, setPinOffersSettings, usePinFromDevice,
  };
}

/** What `useHousingLocation` holds, as the screen reads it. */
export type HousingLocation = ReturnType<typeof useHousingLocation>;
