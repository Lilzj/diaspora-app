// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Edit a marketplace listing (14 Oct 2026)
//
// Once a listing was published its owner could remove it and nothing else: a
// wrong price, a typo in the title or a sold-out delivery option meant deleting
// the listing and starting the seven-step wizard again. The server has always
// accepted edits (`PUT /marketplace/listings/{id}` and the media routes); no
// screen ever sent one.
//
// One scrolling form rather than a wizard, because an edit is a change to one
// or two things on a listing that already exists, and stepping through seven
// screens to fix a price is the cost this screen exists to remove.
//
// The PUT **replaces** the listing. This screen therefore never builds the
// request itself: `toUpdateRequest` takes the listing exactly as it was read and
// lays the member's changes over it, so the fields not shown here — brand,
// area, delivery radius, visibility — go back unchanged rather than blank. See
// `lib/marketplace-listings-api.ts`.
//
// Swaps are marketplace listings and edit here too. Their terms (what the
// member wants in exchange) are attributes, which the PUT cannot reach, so the
// swap's price field is its top-up and nothing more.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { PhotoDropZone } from '@/components/PhotoDropZone';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useNotification } from '@/providers/notification-provider';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import type { ChosenPhoto } from '@/types/media';
import { useAuthStore } from '@/store/auth';
import { useMemberCurrency, currencyForResidence } from '@/lib/member-currency';
import { photoUriOf } from '@/lib/media-url';
import { backOr } from '@/lib/navigation';
import {
  MAX_MARKETPLACE_LISTING_MEDIA,
  applyMarketplaceListingPhotoChanges,
  fetchMarketplaceListingForEdit,
  isDerivedSummary,
  problemDetail,
  toUpdateRequest,
  updateMarketplaceListing,
  type MarketplaceListingForEdit,
} from '@/lib/marketplace-listings-api';

/** `ProductCondition`, by its wire name, in the words a seller uses. */
const CONDITIONS: { value: string; label: string }[] = [
  { value: 'New', label: 'New' },
  { value: 'LikeNew', label: 'Like new' },
  { value: 'Excellent', label: 'Very good' },
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
  { value: 'ForParts', label: 'For parts or repair' },
  { value: 'NotApplicable', label: 'Does not apply' },
];

/** What the member can change, as the form holds it. */
interface FormState {
  title: string;
  description: string;
  summary: string;
  condition: string;
  price: string;
  isNegotiable: boolean;
  minimumOffer: string;
  offersPickup: boolean;
  offersDelivery: boolean;
  offersShipping: boolean;
}

function formFrom(listing: MarketplaceListingForEdit): FormState {
  const price = listing.price;
  const amount = price?.isDisclosed !== false && typeof price?.amount === 'number' ? price.amount : null;

  return {
    title: listing.title ?? '',
    description: listing.description ?? '',
    // A derived summary is the description's opening, not something the seller
    // wrote — shown empty, so the field says what it is: optional, and filled
    // from the description when left so.
    summary: isDerivedSummary(listing) ? '' : listing.summary ?? '',
    condition: listing.condition ?? '',
    price: amount === null ? '' : String(amount),
    isNegotiable: price?.isNegotiable ?? false,
    minimumOffer: typeof price?.minimumOffer === 'number' ? String(price.minimumOffer) : '',
    offersPickup: listing.fulfillment?.offersPickup ?? false,
    offersDelivery: listing.fulfillment?.offersDelivery ?? false,
    offersShipping: listing.fulfillment?.offersShipping ?? false,
  };
}

/** A typed amount, or null for an empty field, or NaN for one that is not a number. */
function amountOf(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** The photographs a listing shows: cover first, then the gallery, each once. */
function photosOf(listing: MarketplaceListingForEdit): string[] {
  const refs = (listing.media ?? []).filter((ref) => ref.role === 'Cover' || ref.role === 'Gallery');
  const ordered = [
    ...refs.filter((ref) => ref.role === 'Cover'),
    ...refs.filter((ref) => ref.role === 'Gallery').sort((a, b) => a.order - b.order),
  ];
  const ids: string[] = [];
  for (const ref of ordered) if (ref.mediaId && !ids.includes(ref.mediaId)) ids.push(ref.mediaId);
  return ids;
}

const pickPhoto = async (
  from: 'camera' | 'gallery',
  refuse: (message: string) => void
): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission =
    from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permission.status !== 'granted') {
    refuse(
      from === 'camera'
        ? 'We need access to your camera to take photos.'
        : 'We need access to your photos to upload images.'
    );
    return null;
  }

  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });

  return !result.canceled && result.assets?.length ? result.assets[0] : null;
};

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="text-sm font-semibold text-content-strong flex-1 mr-3">{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export default function EditMarketplaceListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = String(id ?? '');
  const queryClient = useQueryClient();
  const { showAlert, showToast } = useNotification();
  const userId = useAuthStore((state) => state.user?.userId);
  const memberCurrency = useMemberCurrency();

  const query = useQuery({
    queryKey: ['marketplace', 'listing-edit', listingId],
    queryFn: () => fetchMarketplaceListingForEdit(listingId),
    enabled: listingId.length > 0,
    // Always the listing as it is now: the revision read here is the one the
    // save is checked against, and a cached one would be refused as stale.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const listing = query.data ?? null;

  // The baseline the form is compared with — the listing as last read. Set once
  // per read, so a background refetch does not wipe what the member is typing.
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<ChosenPhoto[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const upload = useMediaUpload({ kind: 'image' });

  useEffect(() => {
    if (!listing) return;
    if (loadedRevision !== null && listing.revision === loadedRevision) return;
    const next = formFrom(listing);
    setBaseline(next);
    setForm(next);
    setLoadedRevision(listing.revision);
    setRemoved([]);
    setAdded([]);
  }, [listing, loadedRevision]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const canManage =
    listing?.canManage === true
    || Boolean(userId && listing?.seller?.ownerUserId && listing.seller.ownerUserId === userId);

  const listingType = (listing?.listingType ?? '').toLowerCase();
  const isGiveaway = listingType === 'giveaway';
  const isDigital = listing?.fulfillment?.isDigital === true;
  const priceLabel =
    listingType === 'wanted' ? 'Budget' : listingType === 'swap' ? 'Top-up you ask for (optional)' : 'Price';

  // The listing's own currency where it has one — a price is never
  // re-denominated by an edit. Only a listing that never had a currency takes
  // the member's, which is how create sets it too.
  const currencyShown = useMemo(() => {
    const own = listing?.price?.currency;
    if (!own) return memberCurrency;
    return own.toUpperCase() === memberCurrency.code
      ? memberCurrency
      : { ...currencyForResidence(null), code: own.toUpperCase(), isKnown: false };
  }, [listing?.price?.currency, memberCurrency]);

  const heldPhotos = useMemo(() => (listing ? photosOf(listing) : []), [listing]);
  const coverId = listing?.media?.find((ref) => ref.role === 'Cover')?.mediaId ?? null;
  const keptPhotos = heldPhotos.filter((mediaId) => !removed.includes(mediaId));
  const photoCount = keptPhotos.length + added.length;
  const atPhotoLimit = photoCount >= MAX_MARKETPLACE_LISTING_MEDIA;

  // ── What the server requires, named on the form (the project's rule) ──────
  //
  // `title` is 3–140 characters and `description` must not be blank
  // (`ListingTitle`, `ListingDescription`); `countryCode` is required by the
  // request and comes from the listing itself; a price must be a number, and a
  // floor may not exceed it (`ListingPrice.Build`).
  const stillNeeded = useMemo(() => {
    if (!form || !listing) return [];
    const missing: string[] = [];
    const title = form.title.trim();
    if (title.length < 3) missing.push('a title of at least 3 characters');
    if (title.length > 140) missing.push('a title of at most 140 characters');
    if (!form.description.trim()) missing.push('a description');
    if (form.summary.trim().length > 400) missing.push('a summary of at most 400 characters');
    if (!listing.location?.countryCode) missing.push("the listing's country, which this screen cannot set");

    if (!isGiveaway) {
      const price = amountOf(form.price);
      if (price !== null && (Number.isNaN(price) || price < 0)) {
        missing.push(`a ${priceLabel.toLowerCase().replace(' (optional)', '')} written as a number`);
      }
      if (form.isNegotiable && price !== null && !Number.isNaN(price)) {
        const floor = amountOf(form.minimumOffer);
        if (floor !== null && (Number.isNaN(floor) || floor < 0)) {
          missing.push('a lowest offer written as a number');
        } else if (floor !== null && floor > price) {
          missing.push('a lowest offer no higher than the price');
        }
      }
    }

    if (upload.isUploading) missing.push('the photo that is still uploading');
    return missing;
  }, [form, listing, isGiveaway, priceLabel, upload.isUploading]);

  const hasChanges = useMemo(() => {
    if (!form || !baseline) return false;
    if (removed.length > 0 || added.length > 0) return true;
    return (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
  }, [form, baseline, removed, added]);

  const detailsChanged = useMemo(() => {
    if (!form || !baseline) return false;
    return (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
  }, [form, baseline]);

  const canSave = hasChanges && stillNeeded.length === 0 && !isSaving;

  const addPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = await pickPhoto(from, (message) =>
        showAlert({ type: 'error', title: 'Permission Denied', message })
      );
      if (!picked) return;
      const asset = await upload.upload(toLocalFile(picked));
      // Null is a failed upload, and the drop zone shows the server's sentence.
      // Nothing joins the list: a photo the platform never received must not
      // look exactly like one it did.
      if (!asset) return;
      setAdded((prev) => [...prev, { mediaId: asset.mediaId, previewUri: asset.thumbnailUrl ?? picked.uri }]);
    },
    [showAlert, upload]
  );

  const choosePhotoSource = () => {
    if (Platform.OS === 'web') {
      void addPhoto('gallery');
      return;
    }
    showAlert({
      type: 'info',
      title: 'Add a photo',
      message: 'Take a new photo or choose one you already have.',
      buttons: [
        { text: '📷 Take Photo (Camera)', onPress: () => void addPhoto('camera') },
        { text: '🖼️ Choose from Gallery', onPress: () => void addPhoto('gallery') },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const save = async () => {
    if (!listing || !form || !canSave) return;
    setIsSaving(true);

    try {
      // Details first. If they are refused nothing else has happened, and the
      // member's form is still here to correct.
      if (detailsChanged) {
        const price = isGiveaway ? undefined : amountOf(form.price);
        const floor = amountOf(form.minimumOffer);
        await updateMarketplaceListing(
          listing.listingId ?? listingId,
          toUpdateRequest(listing, {
            title: form.title.trim(),
            description: form.description.trim(),
            // Empty means "let the server derive it", which is what the field
            // says beneath it.
            summary: form.summary.trim() ? form.summary.trim() : form.summary !== baseline?.summary ? null : undefined,
            condition: form.condition || undefined,
            price: price === undefined ? undefined : price,
            fallbackCurrency: memberCurrency.code,
            isNegotiable: form.isNegotiable,
            minimumOffer: floor,
            offersPickup: form.offersPickup,
            offersDelivery: form.offersDelivery,
            offersShipping: form.offersShipping,
          })
        );
      }
    } catch (cause) {
      setIsSaving(false);
      showAlert({
        type: 'error',
        title: 'Could not save your changes',
        message:
          problemDetail(cause) ?? 'Nothing was changed. Please check your connection and try again.',
      });
      return;
    }

    const photoFailures =
      removed.length > 0 || added.length > 0
        ? await applyMarketplaceListingPhotoChanges(listing.listingId ?? listingId, listing.media ?? [], {
            remove: removed,
            add: added.map((photo) => photo.mediaId),
          })
        : [];

    // Every list that shows this listing refetches — Discover, My Listings,
    // Creator Studio, the listing itself. Editing is rare; refreshing
    // everything is cheap and is what the remove button does too.
    void queryClient.invalidateQueries();
    setIsSaving(false);

    if (photoFailures.length > 0) {
      // The details are saved; some photographs are not. Said as both, and the
      // form reloads from the server so what it shows is what the listing holds.
      setLoadedRevision(null);
      void query.refetch();
      showAlert({
        type: 'error',
        title: 'Some photo changes did not go through',
        message: `${detailsChanged ? 'Your other changes are saved. ' : ''}${photoFailures[0]}`,
      });
      return;
    }

    showToast({ type: 'success', title: 'Listing updated', message: 'Your changes are live on Diaspora.' });
    backOr(`/marketplace/${listingId}`);
  };

  // ── States other than the form ─────────────────────────────────────────────

  if (query.isLoading || (listing && !form)) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Edit listing" showBack onBack={() => backOr(`/marketplace/${listingId}`)} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (query.isError || !listing || !form) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Edit listing" showBack onBack={() => backOr(`/marketplace/${listingId}`)} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base font-bold text-content-strong text-center mb-2">
            This listing could not be loaded
          </Text>
          <Text className="text-sm text-content-muted text-center mb-6">
            {problemDetail(query.error) ?? 'Please check your connection and try again.'}
          </Text>
          <Button label="Try again" variant="outline" onPress={() => void query.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!canManage) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Edit listing" showBack onBack={() => backOr(`/marketplace/${listingId}`)} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base font-bold text-content-strong text-center mb-2">
            You can only edit your own listing
          </Text>
          <Text className="text-sm text-content-muted text-center">
            This listing belongs to another member.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── The form ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit listing" showBack onBack={() => backOr(`/marketplace/${listingId}`)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Input
            label="Title"
            value={form.title}
            onChangeText={(value) => set('title', value)}
            maxLength={140}
          />

          <Input
            label="Description"
            value={form.description}
            onChangeText={(value) => set('description', value)}
            multiline
            numberOfLines={5}
            className="h-32"
          />

          <Input
            label="Short summary (optional)"
            placeholder="Taken from the description when left empty"
            value={form.summary}
            onChangeText={(value) => set('summary', value)}
            maxLength={400}
            multiline
            numberOfLines={2}
          />

          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3 mt-2">
            Condition
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {CONDITIONS.map((option) => {
              const selected = form.condition === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => set('condition', option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={`px-3.5 py-2 rounded-full border ${
                    selected ? 'bg-surface-muted border-primary-500' : 'bg-surface-card border-subtle'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selected ? 'text-primary-600' : 'text-content-secondary'}`}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isGiveaway ? (
            <Text className="text-sm text-content-muted mb-6">
              This item is given away free, so it has no price. To charge for it, remove this listing and create a new one.
            </Text>
          ) : (
            <View className="mb-4">
              <CurrencyNote currency={currencyShown} />
              <Input
                label={`${priceLabel} (${currencyShown.code})`}
                placeholder="Leave empty for “price on request”"
                value={form.price}
                onChangeText={(value) => set('price', value)}
                keyboardType="decimal-pad"
              />
              <Toggle
                label="Open to offers"
                value={form.isNegotiable}
                onChange={(value) => set('isNegotiable', value)}
              />
              {form.isNegotiable && amountOf(form.price) !== null ? (
                <Input
                  label="Lowest offer you will consider (optional)"
                  placeholder="Not shown to buyers"
                  value={form.minimumOffer}
                  onChangeText={(value) => set('minimumOffer', value)}
                  keyboardType="decimal-pad"
                />
              ) : null}
            </View>
          )}

          {isDigital ? null : (
            <View className="mb-6">
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-1">
                How the buyer gets it
              </Text>
              <Toggle label="Collection in person" value={form.offersPickup} onChange={(value) => set('offersPickup', value)} />
              <Toggle label="Local delivery" value={form.offersDelivery} onChange={(value) => set('offersDelivery', value)} />
              <Toggle label="Shipping" value={form.offersShipping} onChange={(value) => set('offersShipping', value)} />
            </View>
          )}

          <PhotoDropZone
            label="Photos"
            prompt={atPhotoLimit ? `A listing holds at most ${MAX_MARKETPLACE_LISTING_MEDIA} photos` : 'Tap to add a photo'}
            busy={upload.isUploading}
            busyLabel={upload.phase === 'processing' ? 'Processing…' : `Uploading ${Math.round(upload.progress * 100)}%`}
            error={upload.phase === 'failed' ? upload.error : null}
            disabled={atPhotoLimit}
            onPress={choosePhotoSource}
          >
            {photoCount > 0 || removed.length > 0 ? (
              <View className="flex-row flex-wrap gap-3 mb-3">
                {heldPhotos.map((mediaId, index) => {
                  const isRemoved = removed.includes(mediaId);
                  const uri = photoUriOf(mediaId, 'small');
                  return (
                    <View
                      key={mediaId}
                      className={`w-[30%] h-24 bg-surface-muted rounded-xl overflow-hidden relative border border-subtle ${
                        isRemoved ? 'opacity-40' : ''
                      }`}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : null}
                      {mediaId === coverId && !isRemoved ? (
                        <View className="absolute bottom-1 left-1 bg-surface-card/80 px-1 rounded">
                          <Text className="text-[8px] font-extrabold text-content-strong">COVER</Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={() =>
                          setRemoved((prev) =>
                            isRemoved ? prev.filter((value) => value !== mediaId) : [...prev, mediaId]
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={isRemoved ? `Keep photo ${index + 1}` : `Remove photo ${index + 1}`}
                        className="absolute top-1 right-1 bg-black/60 px-1.5 h-5 rounded-full items-center justify-center"
                      >
                        <Text className="text-white text-[10px] font-bold">{isRemoved ? 'Undo' : '✕'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {added.map((photo, index) => (
                  <View
                    key={photo.mediaId}
                    className="w-[30%] h-24 bg-surface-muted rounded-xl overflow-hidden relative border border-primary-500"
                  >
                    <Image source={{ uri: photo.previewUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <TouchableOpacity
                      onPress={() => setAdded((prev) => prev.filter((item) => item.mediaId !== photo.mediaId))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove new photo ${index + 1}`}
                      className="absolute top-1 right-1 bg-black/60 w-5 h-5 rounded-full items-center justify-center"
                    >
                      <Text className="text-white text-[10px] font-bold">✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </PhotoDropZone>

          {/* The refusal, said where the button is (the project's rule). */}
          {stillNeeded.length > 0 ? (
            <Text accessibilityLiveRegion="polite" className="text-xs font-semibold text-error-default mb-3">
              Still needed: {stillNeeded.join(', ')}.
            </Text>
          ) : !hasChanges ? (
            <Text className="text-xs text-content-muted mb-3">Change something to save it.</Text>
          ) : null}

          <Button
            label="Save changes"
            loadingLabel="Saving…"
            isLoading={isSaving}
            disabled={!canSave}
            onPress={() => void save()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
