// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform: editing a home after it is listed
//
// Added 14 Oct 2026. A landlord could create a listing and remove it, and
// nothing in between: a rent rise or a corrected bedroom count meant deleting
// the home (with its viewings, saves and enquiries) and listing it again.
//
// One scrolling form, not the create wizard. Somebody editing knows which field
// they came for, and seven steps to change the rent is seven chances to give up.
//
// What it sends, and why so little: the PATCH carries only the fields that
// changed (`diffHousingEdit`), the move-in date goes to its own route, and
// photos are attached and detached one by one. The server cannot clear a field
// (null means "leave it"), so this form never offers to: rent cannot go back to
// "on application" and a move-in date cannot go back to "now". The currency is
// the listing's and is never sent; the member did not choose it on the way in
// and does not choose it here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePhotoSource, type PhotoSource } from '@/hooks/photo-source';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { DatePickerInput } from '@/components/DatePickerInput';
import { useNotification } from '@/providers/notification-provider';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import { photoUriOf } from '@/lib/media-url';
import { backOr } from '@/lib/navigation';
import { useAuthStore } from '@/store/auth';
import { hostFromLandlord, isHostedBy, type LandlordSummaryWire } from '@/lib/housing-host';
import {
  applyHousingPhotoChanges,
  diffHousingEdit,
  fetchHousingListing,
  fetchHousingListingOptions,
  housingEditPhotos,
  setHousingAvailableFrom,
  toHousingEditValues,
  updateHousingListing,
  type HousingEditValues,
} from '@/lib/housing-listings-api';

/** The form's own copy: text fields stay text until save, so "1." is not rejected mid-typing. */
interface FormState {
  title: string;
  summary: string;
  description: string;
  rent: string;
  deposit: string;
  isNegotiable: boolean;
  utilitiesIncluded: boolean;
  internetIncluded: boolean;
  bedrooms: string;
  bathrooms: string;
  furnishedStatus: string;
  leaseType: string;
  availableFrom: string;
}

/** A photo uploaded on this screen, not yet attached to the listing. */
interface NewPhoto {
  mediaId: string;
  previewUri: string;
}

const toForm = (values: HousingEditValues): FormState => ({
  title: values.title,
  summary: values.summary,
  description: values.description,
  rent: values.rentAmount === null ? '' : String(values.rentAmount),
  deposit: values.depositAmount === null ? '' : String(values.depositAmount),
  isNegotiable: values.isNegotiable,
  utilitiesIncluded: values.utilitiesIncluded,
  internetIncluded: values.internetIncluded,
  bedrooms: String(values.bedrooms),
  bathrooms: String(values.bathrooms),
  furnishedStatus: values.furnishedStatus,
  leaseType: values.leaseType,
  availableFrom: values.availableFrom,
});

const parseAmount = (text: string): number | null | 'invalid' => {
  const trimmed = text.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
};

/** The server's own sentence when it sent one; it knows which rule refused the save. */
const problemDetail = (cause: unknown): string => {
  const data = (cause as { response?: { data?: { detail?: unknown; title?: unknown } } })?.response?.data;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data?.title === 'string' && data.title.trim()) return data.title;
  return 'Diaspora could not save your changes just now. Nothing you typed was lost; try again.';
};

export default function EditHousingListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = String(id ?? '');
  const queryClient = useQueryClient();
  const { showAlert, showToast } = useNotification();
  // Camera or gallery, asked (Android UAT, 3 Nov 2026).
  const photoSource = usePhotoSource();
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  const listingQuery = useQuery({
    queryKey: ['housing-listing-edit', listingId],
    queryFn: () => fetchHousingListing(listingId),
    enabled: !!listingId,
  });

  // Served, never hard-coded: the server parses an unknown key into
  // "unspecified" without a word, which is how every lease the old form sent was lost.
  const optionsQuery = useQuery({
    queryKey: ['housing-listing-options'],
    queryFn: fetchHousingListingOptions,
  });

  const wire = listingQuery.data;
  const original = useMemo(() => (wire ? toHousingEditValues(wire) : null), [wire]);
  const existingPhotos = useMemo(() => (wire ? housingEditPhotos(wire) : []), [wire]);

  const [form, setForm] = useState<FormState | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Seeded once per load. A refetch in the background must not overwrite what
  // the member is in the middle of typing.
  useEffect(() => {
    if (original && form === null) {
      setForm(toForm(original));
      setCoverId(existingPhotos.find((photo) => photo.isCover)?.mediaId ?? existingPhotos[0]?.mediaId ?? null);
    }
  }, [original, existingPhotos, form]);

  // Same rule as the listing page's own owner controls (`isHostedBy`), and the
  // server's `isOwner` besides: it is the server that will refuse the write.
  const isOwner =
    wire?.isOwner === true ||
    isHostedBy(hostFromLandlord(wire?.landlord as LandlordSummaryWire | undefined), userId);

  const upload = useMediaUpload({ kind: 'image' });

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const addPhotoFrom = useCallback(async (source: PhotoSource) => {
    const picked = (await photoSource.launch(source, { allowsEditing: true, quality: 0.8 }))?.[0];
    if (!picked) return;

    // Uploaded now, attached on save. A photo the platform never received must
    // not sit in the grid looking like one it did, so a failed upload adds nothing.
    const asset = await upload.upload(toLocalFile(picked));
    if (!asset) return;
    setAdded((current) => [...current, { mediaId: asset.mediaId, previewUri: asset.thumbnailUrl ?? picked.uri }]);
  }, [photoSource, upload]);

  const addPhoto = useCallback(
    () => photoSource.ask('Add a photo', (source) => void addPhotoFrom(source)),
    [addPhotoFrom, photoSource]
  );

  const keptExisting = existingPhotos.filter((photo) => !removed.includes(photo.mediaId));
  const photoCount = keptExisting.length + added.length;

  // The cover the save will leave behind. If the member removed the cover and
  // chose nothing else, the first remaining photo takes its place rather than
  // the card going blank.
  const allIds = [...keptExisting.map((photo) => photo.mediaId), ...added.map((photo) => photo.mediaId)];
  const effectiveCover = coverId && allIds.includes(coverId) ? coverId : (allIds[0] ?? null);

  // ── Validation: name the field, not "invalid form" ───────────────────────
  const parsed = useMemo(() => {
    if (!form || !original) return null;
    const rent = parseAmount(form.rent);
    const deposit = parseAmount(form.deposit);
    const bedrooms = Number(form.bedrooms.trim());
    const bathrooms = Number(form.bathrooms.trim());

    let missing: string | null = null;
    if (!form.title.trim()) missing = 'Add a title.';
    else if (!form.summary.trim()) missing = 'Add a short summary; a published home needs one.';
    else if (rent === 'invalid') missing = 'Rent must be a number.';
    else if (rent === null && original.rentAmount !== null) missing = 'Add the rent. It cannot be removed once stated.';
    else if (deposit === 'invalid') missing = 'Deposit must be a number (leave it empty for none).';
    else if (!form.bedrooms.trim() || !Number.isInteger(bedrooms) || bedrooms < 0) missing = 'Bedrooms must be a whole number (0 for a studio).';
    else if (!form.bathrooms.trim() || !Number.isFinite(bathrooms) || bathrooms < 0) missing = 'Bathrooms must be a number.';
    else if (photoCount === 0) missing = 'Keep at least one photo; a published home needs one.';

    const values: HousingEditValues = {
      title: form.title,
      summary: form.summary,
      description: form.description,
      rentAmount: rent === 'invalid' ? null : rent,
      depositAmount: deposit === 'invalid' ? null : deposit,
      isNegotiable: form.isNegotiable,
      utilitiesIncluded: form.utilitiesIncluded,
      internetIncluded: form.internetIncluded,
      bedrooms,
      bathrooms,
      furnishedStatus: form.furnishedStatus,
      leaseType: form.leaseType,
      availableFrom: form.availableFrom,
    };
    return { missing, values };
  }, [form, original, photoCount]);

  const patch = useMemo(
    () => (parsed && original && !parsed.missing ? diffHousingEdit(original, parsed.values) : {}),
    [parsed, original]
  );
  const originalCover = existingPhotos.find((photo) => photo.isCover)?.mediaId ?? null;
  const dateChanged = !!form && !!original && !!form.availableFrom && form.availableFrom !== original.availableFrom;
  const photosChanged = removed.length > 0 || added.length > 0 || effectiveCover !== originalCover;
  const hasChanges = Object.keys(patch).length > 0 || dateChanged || photosChanged;
  const canSave = hasChanges && !parsed?.missing && !isSaving && !upload.isUploading;

  const save = async () => {
    if (!canSave || !wire) return;
    setIsSaving(true);
    try {
      // The revision the form was loaded at, so a save over somebody else's
      // newer edit is refused rather than silently winning.
      await updateHousingListing(listingId, {
        ...patch,
        baseRevision: typeof wire.revision === 'number' ? wire.revision : undefined,
      });
      if (dateChanged && form) await setHousingAvailableFrom(listingId, form.availableFrom);
      if (photosChanged) {
        await applyHousingPhotoChanges(listingId, {
          existing: existingPhotos,
          removed,
          added: added.map((photo) => photo.mediaId),
          coverId: effectiveCover,
        });
      }

      // Every list and card that may show this home: the detail page, Discover,
      // Creator Studio, the owner's listings. Cheaper to refetch than to guess.
      await queryClient.invalidateQueries();
      showToast({ type: 'success', title: 'Listing updated', message: 'Your changes are saved.' });
      backOr(`/housing/${listingId}` as never);
    } catch (cause) {
      // The form stays as it is. Part of the save may have landed (the PATCH
      // before a photo failed); a refetch shows the member what the server holds.
      setIsSaving(false);
      showAlert({ type: 'error', title: 'Changes not saved', message: problemDetail(cause) });
      void listingQuery.refetch();
    }
  };

  // ── States before the form ──────────────────────────────────────────────
  if (listingQuery.isLoading || (wire && !form)) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
        <ScreenHeader title="Edit home" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (listingQuery.isError || !wire || !form || !original) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
        <ScreenHeader title="Edit home" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-content-secondary text-center mb-4">
            This listing could not be loaded.
          </Text>
          <Button label="Try again" variant="outline" fullWidth={false} onPress={() => void listingQuery.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isOwner) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
        <ScreenHeader title="Edit home" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-content-secondary text-center">You can only edit your own listing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currency = wire.price?.currencyCode ?? null;
  const furnishing = optionsQuery.data?.furnishing ?? [];
  const leaseTypes = optionsQuery.data?.leaseTypes ?? [];

  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    <View className="flex-row items-center justify-between py-3">
      <Text className="text-base text-content-primary flex-1 pr-4">{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      <ScreenHeader title="Edit home" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-2">About the home</Text>
        <Input label="Title" value={form.title} onChangeText={(text) => set('title', text)} />
        <Input label="Summary" value={form.summary} onChangeText={(text) => set('summary', text)} />
        <Input
          label="Description"
          value={form.description}
          onChangeText={(text) => set('description', text)}
          multiline
          className="h-32 py-3"
          textAlignVertical="top"
        />

        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-6 mb-2">Rent</Text>
        {/* The listing's currency, stated rather than chosen. */}
        {currency ? (
          <View className="flex-row items-center bg-surface-muted rounded-xl px-3 py-2 mb-4">
            <Text className="text-xs font-bold text-content-secondary">Prices are in {currency}.</Text>
          </View>
        ) : null}
        <Input
          label={`Rent${currency ? ` (${currency})` : ''}`}
          value={form.rent}
          onChangeText={(text) => set('rent', text)}
          keyboardType="decimal-pad"
        />
        <Input
          label={`Deposit${currency ? ` (${currency})` : ''}`}
          value={form.deposit}
          onChangeText={(text) => set('deposit', text)}
          keyboardType="decimal-pad"
          placeholder="Leave empty for no deposit"
        />
        {toggle('Rent is negotiable', form.isNegotiable, (next) => set('isNegotiable', next))}
        {toggle('Utilities included', form.utilitiesIncluded, (next) => set('utilitiesIncluded', next))}
        {toggle('Internet included', form.internetIncluded, (next) => set('internetIncluded', next))}

        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-6 mb-2">The property</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Input label="Bedrooms" value={form.bedrooms} onChangeText={(text) => set('bedrooms', text)} keyboardType="number-pad" />
          </View>
          <View className="flex-1">
            <Input label="Bathrooms" value={form.bathrooms} onChangeText={(text) => set('bathrooms', text)} keyboardType="decimal-pad" />
          </View>
        </View>

        <Text className="text-sm font-bold text-content-primary mt-2 mb-2">Furnishing</Text>
        {optionsQuery.isLoading ? <ActivityIndicator /> : null}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {furnishing.map((choice) => (
            <CategoryChip
              key={choice.key}
              label={choice.label}
              isSelected={form.furnishedStatus === choice.key}
              onPress={() => set('furnishedStatus', choice.key)}
            />
          ))}
        </View>

        <Text className="text-sm font-bold text-content-primary mb-2">Lease</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {leaseTypes.map((choice) => (
            <CategoryChip
              key={choice.key}
              label={choice.label}
              isSelected={form.leaseType === choice.key}
              onPress={() => set('leaseType', choice.key)}
            />
          ))}
        </View>
        {optionsQuery.isError ? (
          <Text className="text-xs text-error-default mb-4">
            Furnishing and lease choices could not be loaded. The listing keeps its current ones.
          </Text>
        ) : null}

        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-2">Availability</Text>
        <DatePickerInput
          label="Available from"
          value={form.availableFrom}
          onChangeDate={(date) => set('availableFrom', date)}
          placeholder="Available now"
        />

        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-6 mb-2">Photos</Text>
        <Text className="text-xs text-content-secondary mb-3">Tap a photo to put it on the card.</Text>
        <View className="flex-row flex-wrap gap-3">
          {[
            ...keptExisting.map((photo) => ({ mediaId: photo.mediaId, uri: photoUriOf(photo.mediaId) })),
            ...added.map((photo) => ({ mediaId: photo.mediaId, uri: photo.previewUri })),
          ].map((photo) => {
            const isCover = photo.mediaId === effectiveCover;
            const isNew = added.some((item) => item.mediaId === photo.mediaId);
            return (
              <View key={photo.mediaId} className="w-28 h-28 rounded-xl overflow-hidden bg-surface-muted">
                <TouchableOpacity
                  className="flex-1"
                  onPress={() => setCoverId(photo.mediaId)}
                  accessibilityRole="button"
                  accessibilityLabel={isCover ? 'Cover photo' : 'Make this the cover photo'}
                >
                  {photo.uri ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                </TouchableOpacity>
                {isCover ? (
                  <View className="absolute left-1 bottom-1 bg-primary-500 rounded-full px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-white">Cover</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  className="absolute right-1 top-1 bg-black/60 rounded-full p-1"
                  accessibilityRole="button"
                  accessibilityLabel="Remove this photo"
                  onPress={() =>
                    isNew
                      ? setAdded((current) => current.filter((item) => item.mediaId !== photo.mediaId))
                      : setRemoved((current) => [...current, photo.mediaId])
                  }
                >
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            onPress={() => void addPhoto()}
            disabled={upload.isUploading}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            className="w-28 h-28 rounded-xl border border-dashed border-line items-center justify-center"
          >
            {upload.isUploading ? <ActivityIndicator /> : <Ionicons name="add" size={28} color="#9CA3AF" />}
          </TouchableOpacity>
        </View>
        {upload.phase === 'failed' && upload.error ? (
          <Text className="text-xs text-error-default mt-2">{upload.error}</Text>
        ) : null}

        <View className="mt-8">
          {parsed?.missing ? (
            <Text className="text-sm text-error-default mb-3 text-center">{parsed.missing}</Text>
          ) : !hasChanges ? (
            <Text className="text-xs text-content-faint mb-3 text-center">Nothing has changed yet.</Text>
          ) : null}
          <Button
            label="Save changes"
            loadingLabel="Saving…"
            isLoading={isSaving}
            disabled={!canSave}
            onPress={() => void save()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
