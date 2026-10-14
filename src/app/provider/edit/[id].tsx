// ─────────────────────────────────────────────────────────────────────────────
// Edit a business (14 Oct 2026)
//
// Until this day an owner could not change anything about a business after
// registering it but its name: not the description, a telephone number, where
// it is, its photographs, or a price on its menu. This screen covers all of
// those, on the server's own routes:
//
//   PUT    /providers/{id}                    name (replace-style: sent whole)
//   PATCH  /providers/{id}/details            description, contact, location
//   POST   /providers/{id}/photos             add a photograph
//   DELETE /providers/{id}/photos/{mediaId}   remove one
//   POST/PUT/DELETE /providers/{id}/services  the menu and its prices
//
// Each part is saved only if it changed, and a part that fails is named, so a
// member never reads "saved" over a change that did not land.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useProvider } from '@/hooks/providers';
import { toLocalFile } from '@/hooks/media';
import { uploadDirect } from '@/lib/media-api';
import { photoUriOf } from '@/lib/media-url';
import { backOr } from '@/lib/navigation';
import { useMemberCurrency } from '@/lib/member-currency';
import { useNotification } from '@/providers/notification-provider';
import {
  addProviderPhoto,
  addProviderService,
  removeProviderPhoto,
  removeProviderService,
  updateProviderDetails,
  updateProviderIdentity,
  updateProviderService,
  type ProviderDetailsPatch,
  type ProviderServiceRequest,
} from '@/lib/provider-registration-api';
import {
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
} from '@/lib/maps/providers/device-location';
import type { LocalFile } from '@/types/media';

interface ServiceRow {
  /** Null for a row the owner is adding. */
  serviceId: string | null;
  name: string;
  minPrice: string;
  maxPrice: string;
  removed: boolean;
}

const contactOf = (methods: { kind: string; value: string }[] | undefined, kind: string) =>
  methods?.find((method) => method.kind.toLowerCase() === kind)?.value ?? '';

const priceText = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

/** The same pricing the create wizard sends: one price, a range, or none. */
function toServiceRequest(row: ServiceRow, currency: string): ProviderServiceRequest {
  const min = Number.parseFloat(row.minPrice);
  const max = Number.parseFloat(row.maxPrice);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return { name: row.name.trim() };
  const isRange = hasMin && hasMax && max > min;
  return {
    name: row.name.trim(),
    pricing: isRange
      ? { model: 'Range', minAmount: min, maxAmount: max, currency }
      : { model: 'Fixed', minAmount: hasMin ? min : max, currency },
  };
}

export default function EditProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { provider, isLoading } = useProvider(id ?? null);
  const { showAlert, showToast } = useNotification();
  const queryClient = useQueryClient();
  const memberCurrency = useMemberCurrency();

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [cityName, setCityName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinNote, setPinNote] = useState<string | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<LocalFile[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // The prices already on the menu are in the business's own currency; a new
  // price is in the same one, never a currency the member picks.
  const currency =
    provider?.services.find((service) => service.pricing?.currency)?.pricing.currency ?? memberCurrency.code;

  useEffect(() => {
    if (!provider || loaded) return;
    setName(provider.name);
    setDescription(provider.profile?.description ?? '');
    setPhone(contactOf(provider.contactMethods, 'phone'));
    setEmail(contactOf(provider.contactMethods, 'email'));
    setWebsite(contactOf(provider.contactMethods, 'website'));
    setCityName(provider.location?.cityName ?? '');
    setAddressLine(provider.location?.addressLine ?? '');
    setServices(
      provider.services.map((service) => ({
        serviceId: service.serviceId,
        name: service.name,
        minPrice: priceText(service.pricing?.minAmount),
        maxPrice: priceText(service.pricing?.maxAmount),
        removed: false,
      }))
    );
    setLoaded(true);
  }, [provider, loaded]);

  const photos = useMemo(() => {
    if (!provider) return [];
    const seen = new Set<string>();
    return [provider.coverMedia, ...provider.gallery]
      .filter((media): media is NonNullable<typeof media> => !!media?.mediaId)
      .filter((media) => (seen.has(media.mediaId) ? false : (seen.add(media.mediaId), true)))
      .filter((media) => !removedPhotoIds.includes(media.mediaId));
  }, [provider, removedPhotoIds]);

  if (isLoading || (!loaded && provider)) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center">
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  if (!provider || provider.viewerState?.canManage !== true) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background">
        <ScreenHeader title="Edit business" showBack />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-base font-black text-content-primary text-center">
            You can only edit your own business.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const original = {
    description: provider.profile?.description ?? '',
    phone: contactOf(provider.contactMethods, 'phone'),
    email: contactOf(provider.contactMethods, 'email'),
    website: contactOf(provider.contactMethods, 'website'),
    cityName: provider.location?.cityName ?? '',
    addressLine: provider.location?.addressLine ?? '',
  };

  const detailsPatch: ProviderDetailsPatch = {};
  if (description.trim() !== original.description.trim()) detailsPatch.description = description.trim();
  if (phone !== original.phone) detailsPatch.phone = phone;
  if (email.trim() !== original.email) detailsPatch.email = email.trim();
  if (website.trim() !== original.website) detailsPatch.website = website.trim();
  if (cityName.trim() !== original.cityName) detailsPatch.cityName = cityName.trim();
  if (addressLine.trim() !== original.addressLine) detailsPatch.addressLine = addressLine.trim();
  if (pin) {
    detailsPatch.latitude = pin.latitude;
    detailsPatch.longitude = pin.longitude;
  }

  const serviceChanges = services.filter((row) => {
    if (row.serviceId === null) return !row.removed && row.name.trim().length > 0;
    if (row.removed) return true;
    const was = provider.services.find((service) => service.serviceId === row.serviceId);
    return (
      !was ||
      was.name !== row.name.trim() ||
      priceText(was.pricing?.minAmount) !== row.minPrice.trim() ||
      priceText(was.pricing?.maxAmount) !== row.maxPrice.trim()
    );
  });

  const nameChanged = name.trim() !== provider.name;
  const hasChanges =
    nameChanged ||
    Object.keys(detailsPatch).length > 0 ||
    removedPhotoIds.length > 0 ||
    newPhotos.length > 0 ||
    serviceChanges.length > 0;

  // What the server needs, named on the screen (the project's rule for forms).
  const missing: string[] = [];
  if (!name.trim()) missing.push('Business name');
  if (!cityName.trim() && !pin && !provider.location?.latitude) missing.push('Town or city');
  services
    .filter((row) => !row.removed && row.serviceId !== null && !row.name.trim())
    .forEach(() => missing.push('A name for every menu item'));

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setNewPhotos((current) => [...current, toLocalFile(result.assets[0])]);
    }
  };

  const pinFromDevice = async () => {
    setIsPinning(true);
    setPinNote(null);
    try {
      const permissions = resolveLocationPermissionProvider();
      let state = await permissions.check();
      if (state.status === 'notRequested' || state.status === 'denied') state = await permissions.request();
      if (state.status !== 'granted' && state.status !== 'grantedApproximate') {
        setPinNote('Diaspora cannot read your location. Type the town instead.');
        return;
      }
      const position = await resolveDeviceLocationProvider().getCurrentPosition({ highAccuracy: true });
      if (!position.ok) {
        setPinNote('Diaspora could not read your location just now. Try again, or type the town.');
        return;
      }
      setPin({ latitude: position.value.coordinate.latitude, longitude: position.value.coordinate.longitude });
      setPinNote('Pinned at your current location. Saved when you press Save.');
    } finally {
      setIsPinning(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    const failed: string[] = [];
    const attempt = async (label: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch {
        failed.push(label);
      }
    };

    if (nameChanged) {
      await attempt('the name', () =>
        updateProviderIdentity(provider.providerId, {
          name: name.trim(),
          providerType: provider.providerType,
          category: provider.category.slug,
          deliveryMode: provider.deliveryMode,
          tags: provider.tags,
        })
      );
    }
    if (Object.keys(detailsPatch).length > 0) {
      await attempt('the details', () => updateProviderDetails(provider.providerId, detailsPatch));
    }
    // New photos first, so a failed removal never leaves the business with none.
    for (const photo of newPhotos) {
      await attempt('a new photo', async () => {
        const asset = await uploadDirect(photo, {
          kind: 'image',
          owner: { ownerType: 'provider', ownerId: provider.providerId, role: 'gallery' },
        });
        await addProviderPhoto(provider.providerId, asset.mediaId, 'gallery');
      });
    }
    for (const mediaId of removedPhotoIds) {
      await attempt('removing a photo', () => removeProviderPhoto(provider.providerId, mediaId));
    }
    for (const row of serviceChanges) {
      if (row.serviceId === null) {
        await attempt(`adding "${row.name.trim()}"`, () =>
          addProviderService(provider.providerId, toServiceRequest(row, currency))
        );
      } else if (row.removed) {
        await attempt(`removing "${row.name}"`, () => removeProviderService(provider.providerId, row.serviceId as string));
      } else {
        await attempt(`"${row.name.trim()}"`, () =>
          updateProviderService(provider.providerId, row.serviceId as string, toServiceRequest(row, currency))
        );
      }
    }

    void queryClient.invalidateQueries();
    setIsSaving(false);

    if (failed.length === 0) {
      showToast({ type: 'success', title: 'Saved', message: 'Your business has been updated.' });
      backOr(`/provider/${provider.providerId}`);
      return;
    }
    showAlert({
      type: 'error',
      title: 'Some changes were not saved',
      message: `Diaspora could not save ${failed.join(', ')}. Everything else was saved. Please try those again.`,
    });
  };

  const updateRow = (index: number, patch: Partial<ServiceRow>) =>
    setServices((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit business" showBack />
      <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-4 mb-2">About</Text>
        <Input label="Business name" value={name} onChangeText={setName} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline />

        <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-2">Contact</Text>
        <PhoneInputWithCode label="Phone number" value={phone} onChangePhone={setPhone} />
        <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Website (optional)" value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" />

        <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-2">Where it is</Text>
        <Input label="Town or city" value={cityName} onChangeText={setCityName} autoCapitalize="words" />
        <Input label="Street address (optional)" value={addressLine} onChangeText={setAddressLine} />
        <TouchableOpacity
          disabled={isPinning}
          onPress={() => void pinFromDevice()}
          accessibilityRole="button"
          className="self-start flex-row items-center px-4 py-2.5 rounded-2xl bg-surface-card border border-subtle mb-1"
        >
          <Ionicons name="locate-outline" size={16} color="#F59300" />
          <Text className="text-xs font-bold text-content-secondary ml-2">
            {isPinning ? 'Finding you…' : "I'm at the business: use my location"}
          </Text>
        </TouchableOpacity>
        {pinNote ? <Text className="text-xs text-content-muted mb-2">{pinNote}</Text> : null}

        <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-2">Photos</Text>
        <View className="flex-row flex-wrap">
          {photos.map((media) => (
            <View key={media.mediaId} className="mr-3 mb-3">
              <Image
                source={{ uri: photoUriOf(media) ?? undefined }}
                style={{ width: 96, height: 72, borderRadius: 12 }}
                contentFit="cover"
              />
              <TouchableOpacity
                onPress={() => setRemovedPhotoIds((ids) => [...ids, media.mediaId])}
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                className="absolute -top-2 -right-2 bg-surface-card rounded-full"
              >
                <Ionicons name="close-circle" size={22} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}
          {newPhotos.map((photo, index) => (
            <View key={photo.uri} className="mr-3 mb-3">
              <Image source={{ uri: photo.uri }} style={{ width: 96, height: 72, borderRadius: 12 }} contentFit="cover" />
              <TouchableOpacity
                onPress={() => setNewPhotos((list) => list.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel="Remove this new photo"
                className="absolute -top-2 -right-2 bg-surface-card rounded-full"
              >
                <Ionicons name="close-circle" size={22} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => void pickPhoto()}
            accessibilityRole="button"
            className="w-24 h-[72px] rounded-xl border border-dashed border-subtle items-center justify-center mb-3"
          >
            <Ionicons name="add" size={22} color="#9CA3AF" />
            <Text className="text-[10px] font-bold text-content-muted">Add photo</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-2">Menu and prices</Text>
        <CurrencyNote currency={memberCurrency} />
        {services.map((row, index) =>
          row.removed ? null : (
            <View key={row.serviceId ?? `new-${index}`} className="bg-surface-card border border-subtle rounded-2xl p-3 mb-3">
              <Input label="Item or service" value={row.name} onChangeText={(value) => updateRow(index, { name: value })} />
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  <Input label={`Price (${currency})`} value={row.minPrice} keyboardType="decimal-pad" onChangeText={(value) => updateRow(index, { minPrice: value })} />
                </View>
                <View className="flex-1">
                  <Input label="Up to (optional)" value={row.maxPrice} keyboardType="decimal-pad" onChangeText={(value) => updateRow(index, { maxPrice: value })} />
                </View>
              </View>
              <TouchableOpacity onPress={() => updateRow(index, { removed: true })} accessibilityRole="button" className="self-start">
                <Text className="text-xs font-bold text-error-default">Remove this item</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        <TouchableOpacity
          onPress={() => setServices((rows) => [...rows, { serviceId: null, name: '', minPrice: '', maxPrice: '', removed: false }])}
          accessibilityRole="button"
          className="self-start px-4 py-2.5 rounded-2xl bg-surface-card border border-subtle mb-6"
        >
          <Text className="text-xs font-bold text-content-secondary">+ Add an item</Text>
        </TouchableOpacity>

        {missing.length > 0 ? (
          <Text accessibilityRole="alert" className="text-xs font-bold text-error-default mb-3">
            Still needed: {Array.from(new Set(missing)).join(', ')}
          </Text>
        ) : null}
        <Button
          label={isSaving ? 'Saving…' : 'Save changes'}
          disabled={!hasChanges || missing.length > 0 || isSaving}
          onPress={() => void save()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
