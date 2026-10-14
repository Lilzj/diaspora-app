import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/apiClient';
import { useTrustStore } from '@/store/trust';
import * as ImagePicker from 'expo-image-picker';
import { PhotoDropZone } from '@/components/PhotoDropZone';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Ionicons } from '@expo/vector-icons';
import { useNotification } from '@/providers/notification-provider';
import type { AlertOptions } from '@/providers/notification-provider';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import type { ChosenPhoto } from '@/types/media';
import { useAuthStore } from '@/store/auth';
import {
  createAndPublishMarketplaceListing,
  fetchMySellerContact,
  problemDetail,
  type SellerContact,
} from '@/lib/marketplace-listings-api';
import { toListingCondition } from '@/lib/marketplace-categories';
import { backOr } from '@/lib/navigation';
import { TradeSafetyNote } from '@/components/safety/TradeSafetyNote';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useMemberCurrency } from '@/lib/member-currency';
import { useMarketplaceCategories } from '@/hooks/marketplace-categories';
import { draftCategoryKey, marketplaceCategoryEmoji } from '@/lib/marketplace-categories';
import { clearDeviceDraft, loadDeviceDraft, saveDeviceDraft } from '@/lib/device-drafts';

/** The designed alert modal, passed to helpers that sit outside a component. */
type ShowAlert = (options: AlertOptions) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave E — these two helpers used to end `return result.assets[0].uri`.
//
// That is a `file:///…` path into this app's own cache directory. It means
// something on exactly one device, for as long as that device keeps its cache,
// and nothing at all to the server. This screen stored it and posted it as
// `coverImage`, so every marketplace photograph in this application was a path
// only the phone that took it could resolve.
//
// They now return the **picked asset**, and the upload happens in the component
// through the one media pipeline (`hooks/media` → `lib/media-api`). It has to be
// in the component: `useMediaUpload` is a hook, and progress and failure are
// things a member has to be able to see. What these helpers still own is the
// permission dance — which is why they stay at module scope, taking the alert
// function from their caller so a refusal lands in the designed modal rather
// than the operating system's dialog.
// ─────────────────────────────────────────────────────────────────────────────
const pickFromGallery = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your photos to upload images.' });
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

const pickFromCamera = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your camera to take photos.' });
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

// Module-level global draft store
let globalMarketplaceDraft: any = null;

const steps = [
  'Listing Type & Intent',
  'Category & Condition',
  'Product Information',
  'Location & Proximity',
  'Photos & Ordering',
  'Contact Preferences',
  'Preview & Publish'
];

const INTENTS = [
  { label: 'Selling', value: 'Selling', desc: 'Sell your item to local community members', icon: '🛍️' },
  { label: 'Buying Request', value: 'Buying Request', desc: 'Request to buy an item from others', icon: '🙋' },
  { label: 'Giving Away', value: 'Giving Away', desc: 'Give away an item for free to the community', icon: '🎁' },
  { label: 'Exchange / Swap', value: 'Exchange / Swap', desc: 'Trade or swap your item with someone else', icon: '🔄' },
  { label: 'Donation', value: 'Donation', desc: 'Support a charitable cause with goods or services', icon: '🤝' }
];

const CONDITIONS = [
  { label: 'New', desc: 'Brand new, never opened, in original packaging' },
  { label: 'Like New', desc: 'Looks and functions like new, minimal or no signs of wear' },
  { label: 'Very Good', desc: 'Minor cosmetic wear, fully operational and clean' },
  { label: 'Good', desc: 'Some wear and tear, but works perfectly' },
  { label: 'Fair', desc: 'Visible wear, scratches or issues, but still usable' }
];


// Remediation Wave E: `MOCK_COVER_PHOTOS` and `MOCK_GALLERY_PHOTOS` stood here —
// two lists of Unsplash URLs that seeded what were supposed to be the member's
// own photographs. They are gone rather than emptied: a listing with no
// photograph must look like a listing with no photograph, on this screen and on
// everybody else's.

/**
 * The seller's intent, as the server's `ListingType`.
 *
 * The form offers six intents and the contract names five types, and they are
 * not the same list. `Exchange / Swap` and `Donation` have no counterpart —
 * swap has its own screen, and a donation is a giveaway as far as this contract
 * is concerned. `Auction` is explicitly "a recognised name and is refused", so
 * nothing here can produce it.
 */
/**
 * How a buyer reaches the seller, in the platform's words.
 *
 * `ContactPreference` is a real member of the contract and a consumed one:
 * `POST /marketplace/listings` binds it, `ListingResponse` returns it, and
 * `ConversationReferenceResponse` carries it so a buyer opening a thread is
 * told how this seller asked to be reached. The wizard collected it from the
 * day it was written and sent it nowhere, so every listing on the platform
 * carries the handler's fallback, `InApp`, whatever its seller chose.
 *
 * The three the screen offers are three the platform has. `Any` is a fourth it
 * models and this form does not ask for, which is why it is not mapped here
 * rather than being guessed at.
 */
function toContactPreference(method: 'in_app' | 'phone' | 'email'): string {
  switch (method) {
    case 'phone':
      return 'Phone';
    case 'email':
      return 'Email';
    default:
      return 'InApp';
  }
}

function toListingType(intent: string, negotiable: boolean): string {
  switch (intent) {
    case 'Giving Away':
    case 'Donation':
      return 'Giveaway';
    case 'Buying Request':
    case 'Wanted':
      return 'Wanted';
    default:
      return negotiable ? 'Negotiable' : 'FixedPrice';
  }
}


export default function CreateListingScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const trustStore = useTrustStore();

  // Whether this member may sell, as the Marketplace service itself says: the
  // `marketplace.listings.create` feature on their access decision, which it
  // grants to verified accounts. Null until the session is restored — an
  // unanswered question is not a no, and the server still refuses a listing it
  // does not allow.
  //
  // This screen used to lock itself with the device's trust engine, asked about
  // a hard-coded 'GB' whatever country the member lives in, against thresholds
  // the Marketplace service never checked. Decided 15 Sep 2026: a verified
  // account is enough, as it is for posting a job.
  const access = useAuthStore((state) => state.access);
  const maySell = access ? access.grantedFeatures.includes('marketplace.listings.create') : null;

  const { showAlert, showToast } = useNotification();


  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // STEP 1: Listing Type
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);

  // The name the seller profile is opened under, if the member has never sold
  // anything before. Their own name rather than an invented trading name — the
  // platform's seller model treats an individual as themselves, and asking a
  // member to name a shop before they can list one item would be a step this
  // screen does not need and the contract does not require.
  const memberName = useAuthStore((state) => state.user?.fullName);
  const sellerDisplayName = (memberName ?? '').trim() || 'Diaspora member';

  const [intent, setIntent] = useState<'Selling' | 'Buying Request' | 'Giving Away' | 'Exchange / Swap' | 'Wanted' | 'Donation'>('Selling');

  // STEP 2: Category & Condition
  /**
   * ISO-3166-1 alpha-2. **Required by the server**, and this form had no source
   * for it — one of the two reasons every submission was refused.
   *
   * The member's verified country of residence, never asked (owner's rule,
   * 14 Oct 2026: "country is not needed on any screen"). It was a typed
   * two-letter field until then. Never silently defaulted: Wave A had to remove
   * `|| 'GB'` fallbacks from registration, and a listing filed under the wrong
   * country is invisible to the people nearest to it — so a member with no
   * residence on file is told so by the step gate instead.
   */
  const countryCode = residenceCountry ?? '';
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('');
  // Server keys, both of them (13 Oct 2026): `category` a top-level key and
  // `subcategory` one of its children, from `GET /marketplace/categories`.
  const categoryCatalogue = useMarketplaceCategories();
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<'New' | 'Like New' | 'Very Good' | 'Good' | 'Fair'>('New');


  // STEP 3: Product Information
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  // From the country of residence, not chosen (13 Oct 2026). It defaulted to GBP.
  const memberCurrency = useMemberCurrency();
  const currency = memberCurrency.code;
  const [negotiable, setNegotiable] = useState(true);
  const [quantity, setQuantity] = useState('1');

  // STEP 4: Location & landmark
  // Chosen from the shared town search (14 Oct 2026); it defaulted to 'London'.
  const [cityName, setCityName] = useState('');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: 51.4702, longitude: -0.0691 });

  // STEP 5: Photos & Ordering
  //
  // Empty, and empty renders as empty. Both of these used to be seeded with
  // Unsplash URLs, so a listing created without a single photograph was posted
  // and previewed as though it had three.
  const [coverPhoto, setCoverPhoto] = useState<ChosenPhoto | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<ChosenPhoto[]>([]);

  // Two upload slots rather than one, because `useMediaUpload` aborts whatever
  // it was doing when a new upload starts — sharing a single instance would mean
  // adding a gallery photo silently cancelled the cover that was still going up.
  const coverUpload = useMediaUpload({ kind: 'image' });
  const galleryUpload = useMediaUpload({ kind: 'image' });

  // The hook's own definition of busy: `uploading` *or* `processing`. The
  // member's waiting is not over when the bytes land — variants are derived
  // afterwards — and a picker reopened in between would abort the slot.
  const coverBusy = coverUpload.isUploading;
  const galleryBusy = galleryUpload.isUploading;

  // STEP 6: Contact Channels
  const [contactPhone, setContactPhone] = useState('');

  // What the platform already has, so an unchanged number is not re-sent and
  // a returning seller is not asked to type their own again.
  const [heldContact, setHeldContact] = useState<SellerContact | null>(null);
  const [preferredContactMethod, setPreferredContactMethod] = useState<'in_app' | 'phone' | 'email'>('in_app');

  // Step 7 AI price checks
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Check draft on mount
  useEffect(() => {
    if (globalMarketplaceDraft) {
      setDraftBannerVisible(true);
      return;
    }
    // Kept on the phone since 14 Oct 2026, so a draft outlives the app being closed.
    void loadDeviceDraft('marketplace').then((saved) => {
      if (saved && !globalMarketplaceDraft) {
        globalMarketplaceDraft = saved;
        setDraftBannerVisible(true);
      }
    });
  }, []);

  /** Whether this listing has a price to state at all. A giveaway does not. */
  const isPriced = intent !== 'Giving Away' && intent !== 'Donation';

  /** A wanted advert states a range; everything else priced states one figure. */
  const wantsRange = intent === 'Buying Request' || intent === 'Wanted';

  /**
   * What each step needs before it can be left, in the member's own words.
   *
   * **This screen already validated — in a popup after the member tapped
   * Next.** Each rule was a `showAlert` in `handleNext`, so the way to find out
   * a field was required was to fill in everything else, press the button, read
   * a dialog, dismiss it, and hunt for the field. Declared here instead, so the
   * step itself says what it is waiting for while the member is still on it.
   *
   * The seller profile is opened at publish from the member's own account, and
   * the photo is required to publish rather than to advance — the server
   * accepts a draft without one — so the cover sits on the last step.
   */
  const requiredByStep: { label: string; filled: boolean }[][] = [
    [{ label: 'Listing intent', filled: !!intent }],
    [{ label: 'Product category', filled: !!category }],
    [
      { label: 'Product title', filled: !!title.trim() },
      { label: 'Description', filled: !!description.trim() },
      ...(isPriced && wantsRange
        ? [
            { label: 'Lowest price', filled: !!minPrice.trim() },
            { label: 'Highest price', filled: !!maxPrice.trim() },
          ]
        : []),
      ...(isPriced && !wantsRange ? [{ label: 'Price', filled: !!price.trim() }] : []),
    ],
    [
      { label: 'Country of residence (set it on your profile)', filled: !!countryCode },
      { label: 'City', filled: !!cityName.trim() },
      { label: 'Neighbourhood or area', filled: !!areaName.trim() },
    ],
    [],
    [],
    [{ label: 'Cover image', filled: !!coverPhoto }],
  ];

  /**
   * Rules that are not about emptiness. A filled field can still be wrong, and
   * "Still needed" is the wrong sentence for a range the member did fill in
   * back to front.
   */
  const problemsByStep: (string | null)[] = [
    null,
    null,
    isPriced
      && wantsRange
      && !!minPrice.trim()
      && !!maxPrice.trim()
      && Number(minPrice) > Number(maxPrice)
      ? 'The lowest price is above the highest one.'
      : null,
    null,
    null,
    null,
    null,
  ];

  const stillNeeded = (requiredByStep[currentStep] ?? [])
    .filter((field) => !field.filled)
    .map((field) => field.label);

  const stepProblem = problemsByStep[currentStep] ?? null;

  // Auto-save draft
  const saveDraft = () => {
    globalMarketplaceDraft = {
      intent, category, subcategory, brand, condition, title, description, price,
      currency, negotiable, quantity, cityName, areaName, addressLine, landmark,
      coverPhoto, galleryPhotos, contactPhone, preferredContactMethod,
      currentStep
    };
    void saveDeviceDraft('marketplace', globalMarketplaceDraft, title);
  };

  // The contact details the platform already holds, if this member has sold
  // before. A first-time seller has no profile and no number, and the read says
  // so rather than failing.
  useEffect(() => {
    let cancelled = false;

    fetchMySellerContact()
      .then((held) => {
        if (cancelled || !held?.phone) return;

        setHeldContact(held);
        setContactPhone(held.phone);
      })
      .catch(() => {
        // Not fatal and not worth a message: the field stays empty, whatever
        // the member types is sent, and the listing is unaffected either way.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (title || description || category || price) {
      saveDraft();
    }
  }, [
    intent, category, subcategory, brand, condition, title, description, price,
    currency, negotiable, quantity, cityName, areaName, addressLine, landmark,
    coverPhoto, galleryPhotos, contactPhone, preferredContactMethod
  ]);

  const restoreDraft = () => {
    if (globalMarketplaceDraft) {
      const d = globalMarketplaceDraft;
      setIntent(d.intent);
      setCategory(draftCategoryKey(d.category));
      // A draft's subcategory was a free-text label before 13 Oct 2026, not a key.
      setSubcategory(categoryCatalogue.find(d.subcategory)?.parentKey ? d.subcategory : '');
      setBrand(d.brand || '');
      setCondition(d.condition);
      setTitle(d.title);
      setDescription(d.description);
      setPrice(d.price);
      // A draft's saved currency is ignored: prices are always the member's own.
      setNegotiable(d.negotiable);
      setQuantity(d.quantity || '1');
      setCityName(d.cityName);
      setAreaName(d.areaName || '');
      setAddressLine(d.addressLine || '');
      setLandmark(d.landmark || '');
      // A restored draft carries identifiers the platform already holds, so the
      // photographs survive without re-uploading. `null` rather than a fallback:
      // a draft saved before any photograph was chosen has none.
      setCoverPhoto(d.coverPhoto || null);
      setGalleryPhotos(d.galleryPhotos || []);
      setContactPhone(d.contactPhone || '');
      setPreferredContactMethod(d.preferredContactMethod || 'in_app');
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalMarketplaceDraft = null;
    void clearDeviceDraft('marketplace');
    setDraftBannerVisible(false);
  };

  /**
   * A picked file, uploaded, as something this screen can hold.
   *
   * The single point where a device path becomes a platform identifier — there
   * is one upload implementation in this application and this calls it.
   */
  const uploadPicked = useCallback(
    async (
      picked: ImagePicker.ImagePickerAsset,
      slot: ReturnType<typeof useMediaUpload>
    ): Promise<ChosenPhoto | null> => {
      const asset = await slot.upload(toLocalFile(picked));

      // Null is a failed or cancelled upload. The slot holds the server's own
      // sentence and step 5 renders it; nothing enters state. That is the point
      // of returning early rather than storing the local URI as a consolation:
      // a photograph the platform never received must not sit in the grid
      // looking exactly like one it did.
      if (!asset) return null;

      // The device's copy is the preview until the platform has a rendition of
      // its own. A direct upload answers at `pending` or `processing` — variants
      // are derived afterwards — so `thumbnailUrl` is usually still null here,
      // and `asset.url` is a route into Media rather than an image that is ready
      // to paint. The identifier below is the part that gets posted, and it is
      // stable from this moment whatever the preview is showing.
      return {
        mediaId: asset.mediaId,
        previewUri: asset.thumbnailUrl ?? picked.uri,
      };
    },
    []
  );

  const chooseCoverPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, coverUpload);
      if (photo) setCoverPhoto(photo);
    },
    [coverUpload, showAlert, uploadPicked]
  );

  const addGalleryPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, galleryUpload);
      // Appended, because order is the contract here — see `handlePublish`.
      if (photo) setGalleryPhotos(prev => [...prev, photo]);
    },
    [galleryUpload, showAlert, uploadPicked]
  );

  const handleCoverPhotoSelect = async () => {
    const title = 'Select Cover Image';
    const message = 'Choose an action to add your property cover photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void chooseCoverPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void chooseCoverPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await chooseCoverPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  const handleAddGalleryPhoto = async () => {
    const title = 'Select Gallery Image';
    const message = 'Choose an action to add a property gallery photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void addGalleryPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void addGalleryPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await addGalleryPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  const reorderGallery = (idx: number) => {
    if (idx === 0) return;
    const next = [...galleryPhotos];
    const temp = next[idx];
    next[idx] = next[idx - 1];
    next[idx - 1] = temp;
    setGalleryPhotos(next);
  };

  const deleteGalleryPhoto = (idx: number) => {
    const next = [...galleryPhotos];
    next.splice(idx, 1);
    setGalleryPhotos(next);
  };

  /**
   * Listing checklist — formerly the "AI Price & Valuation Guide".
   *
   * ── What it used to say ───────────────────────────────────────────────────
   *
   *   > A fair market price for a '{condition}' {category} in {cityName} is
   *   > between {currency} {price × 0.8} and {currency} {price × 1.2}.
   *   > Your pricing is positioned within optimal community ranges.
   *
   * The "fair market price" was the member's own asking price ±20%, so the
   * band was **always centred on whatever they had typed** and their price was
   * *necessarily* inside it — the verdict on the next line could not come out
   * any other way. Ask £40 and £32–48 was fair; ask £4,000 and £3,200–4,800 was
   * fair. Neither the category, the condition nor the city entered the
   * arithmetic despite all three being quoted as if they had. An empty price
   * field fell back to `50`, so a member who had not yet decided was handed a
   * £40–60 valuation for an unspecified object.
   *
   * The one non-circular claim — *"Free listings convert 3x faster"* — is a
   * conversion statistic about this marketplace that nobody has measured.
   *
   * ── Why there is no route to wire it to ───────────────────────────────────
   *
   * The Marketplace module has no market or price statistics contract of any
   * kind; the only aggregate anywhere near it is `AverageResponseMinutes` on
   * the seller profile. No pricing, valuation, comparable-listing or
   * content-scoring endpoint is registered in any module.
   *
   * ── What it does now ──────────────────────────────────────────────────────
   *
   * Reports the form's own state, quotes the values it read, and says outright
   * that Diaspora cannot value an item. Nothing is multiplied by anything.
   */
  const runListingCheck = () => {
    setAiLoading(true);
    setAiSuggestions(null);

    const catObj = categoryCatalogue.find(category);
    const lines: string[] = [];

    lines.push(
      title.trim().length >= 15
        ? `✅ Title — ${title.trim().length} characters.`
        : `⚠️ Title — ${title.trim().length} characters. Include what the item is and its make or model.`
    );
    lines.push(
      catObj
        ? `✅ Category — ${catObj.name}.`
        : '❌ Category — not chosen.'
    );
    lines.push(`✅ Condition — ${condition}.`);
    lines.push(
      description.trim().length >= 60
        ? `✅ Description — ${description.trim().length} characters.`
        : `⚠️ Description — ${description.trim().length} characters. Faults and wear described up front prevent disputes at handover.`
    );

    const photoCount = (coverPhoto ? 1 : 0) + galleryPhotos.length;
    lines.push(
      photoCount > 0
        ? `✅ Photos — ${photoCount} added.`
        : '❌ Photos — none added. Listings without photos are rarely contacted.'
    );

    // Price is reported, never judged. The one thing worth saying about it is a
    // fact about this screen's own form, not about the market.
    const priceValue = Number(price);
    if (intent === 'Giving Away') {
      lines.push('✅ Price — giving this away for free.');
    } else if (price && priceValue > 0) {
      lines.push(`✅ Price — ${currency} ${priceValue} asked.`);
    } else {
      lines.push('❌ Price — not entered.');
    }

    setAiLoading(false);
    setAiSuggestions(
      `Checklist for this listing\n\n${lines.join('\n')}\n\n` +
      `This checks what you have filled in on this screen. Diaspora cannot value an item or tell you what similar things are selling for — have a look at comparable listings in Marketplace to decide your price.`
    );
  };

  const handlePublish = async () => {
    setIsSubmitting(true);

    // Remediation Wave E — `CreateListingRequest.MediaIds`:
    //
    //   > Media identifiers to attach at once, cover first.
    //
    // A flat list of identifiers, and **the order carries the meaning**: there is
    // no role field on this contract, so position 0 *is* the cover. That is why
    // the cover is prepended here rather than sent as a field of its own, and why
    // the member's gallery ordering in step 5 is load-bearing rather than
    // cosmetic.
    //
    // Housing's contract is deliberately not this shape — it takes
    // `media: [{ mediaId, role }]` with an explicit role — so the two screens are
    // not unified. Making them look alike would mean one of them is lying about
    // what its server reads.
    //
    // This replaces `coverImage` (a `file:///…` device path) and `gallery` (the
    // same path repeated at the front of a list of others). Neither field exists
    // on the request the server binds.
    const mediaIds = [
      ...(coverPhoto ? [coverPhoto.mediaId] : []),
      ...galleryPhotos.map((photo) => photo.mediaId),
    ];

    // The most precise key chosen: the subcategory when there is one.
    const categoryKey = subcategory || category;
    if (!categoryKey) {
      showAlert({
        type: 'error',
        title: 'Not listed',
        message: 'Choose a category — Diaspora needs it to file the listing.',
      });
      setIsSubmitting(false);
      return;
    }

    /**
     * The create payload, as `CreateListingRequest` actually declares it.
     *
     * ── This screen could not create a listing ─────────────────────────────
     *
     * The DTO declares four `required` members — `Title`, `Description`,
     * `CategoryKey`, `CountryCode` — and this payload supplied two. C#
     * `required` means System.Text.Json refuses the body **before any handler
     * runs**, so every submission 400'd, and nine further keys were discarded by
     * the model binder without comment.
     *
     * What changed:
     *
     *   `categoryKey`   the seeded catalogue key. The client's ids were never
     *                   the server's — `phones` vs `mobile-phones`, and
     *                   `african_food` could not match anything under any
     *                   normalisation, carrying an underscore where every
     *                   seeded key uses a hyphen.
     *   `countryCode`   new required field, prefilled from residence.
     *   `negotiable`    → `isNegotiable`.
     *   `intent`        → `listingType`, over a different vocabulary.
     *   `condition`     → the contract's spelling (`LikeNew`, `Excellent`).
     *   `deliveryAvailable` / `pickupOnly` → `offersDelivery` / `offersPickup`.
     *   `location: {…}` flattened; the DTO has no nested location.
     *   `subcategory`   dropped — no field. Carried as a tag instead, which is
     *                   the nearest thing the contract offers and is honest
     *                   about being a label rather than a taxonomy.
     *
     * **`status: 'Active'` is gone.** There is no such member, and the type's
     * own summary says a draft is allowed to be incomplete — "a seller
     * photographs the thing before they know what to charge for it."
     *
     * **`seller` is deleted, and it was the worst thing on this screen.** The
     * DTO has no such member so none of it reached the server, but it was
     * assembled on every submission carrying `sellerId: 'user-123'`,
     * `name: 'Amara Kone'`, `isVerified: true`, `rating: 4.8` — and two
     * fabricated `countryVerifications`, each with `isVerified: true`, an
     * arrival year and a years-of-residence figure.
     *
     * That last part is the sharpest thing this remediation has found in a
     * payload: fabricated *trust* data, on the object a buyer uses to decide
     * whether a stranger is safe to meet. The seller is the authenticated
     * caller, and Trust owns whether anybody is verified.
     */
    const payload = {
      title: title.trim(),
      description: description.trim(),
      categoryKey,
      countryCode: countryCode.trim().toUpperCase(),
      listingType: toListingType(intent, negotiable),
      condition: toListingCondition(condition),
      price: intent === 'Giving Away' || intent === 'Donation' ? 0 : Number(price) || undefined,
      currency: currency || undefined,
      isNegotiable: intent === 'Giving Away' || intent === 'Donation' ? false : negotiable,
      quantity: Number(quantity) || 1,
      brand: brand.trim() || undefined,
      regionName: areaName.trim() || undefined,
      cityName: cityName.trim() || undefined,
      neighbourhood: landmark.trim() || undefined,
      offersDelivery: true,
      offersPickup: true,
      // Step 6's own question, answered on the listing it was asked about.
      contactPreference: toContactPreference(preferredContactMethod),
      tags: undefined,
      mediaIds,
    };

    try {
      // ── Remediation: the three steps this screen took one of ─────────────
      //
      // Remediation Wave A′ corrected the *path* — `POST /marketplace` is a
      // GET-only dashboard, so the old call was a 405 rather than a 404. What
      // it did not correct is that one POST was never enough:
      //
      //   1. `POST /marketplace/sellers`  — without a seller profile every
      //      listing write is `403 marketplace.not-seller`, and no surface in
      //      this application had ever created one (DEFECT-008).
      //   2. `POST /marketplace/listings` — creates a **Draft**.
      //   3. `POST …/{id}/publish`        — the step that makes it visible,
      //      which this screen never called while telling the member it had
      //      (DEFECT-011).
      //
      // `createAndPublishMarketplaceListing` owns the sequence, and resolves
      // `draft-only` rather than throwing when only publication is refused —
      // because the member's listing is saved either way and being told it was
      // not would be a second untrue sentence.
      const outcome = await createAndPublishMarketplaceListing(payload, {
        displayName: sellerDisplayName,
        countryCode: countryCode.trim().toUpperCase(),
        // The number goes on the seller profile, which is where a buyer reads
        // it from. The listing carries the *preference* — they are two fields
        // and the wizard was sending neither. Only what changed: a full
        // replace that changes nothing is still a write.
        contact:
          contactPhone.trim() && contactPhone.trim() !== (heldContact?.phone ?? '')
            ? { phone: contactPhone.trim() }
            : {},
      });

      globalMarketplaceDraft = null;

      void clearDeviceDraft('marketplace');
      setIsSubmitting(false);

      if (outcome.kind === 'published') {
        trustStore.addAuditLog('Marketplace Listing Published', `Published marketplace item: "${title}"`);
        showAlert({
          type: 'success',
          title: 'Listing Published',
          message: 'Your item is now visible on the Diaspora Marketplace.',
          buttons: [
            {
              text: 'Browse Marketplace',
              onPress: () => {
                router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Marketplace' } });
              },
            },
          ],
        });
        return;
      }

      // Saved, not visible — and the difference is the whole point of saying
      // so. The server's own sentence names what is missing ("it still needs at
      // least one photograph"), so it is shown rather than replaced with a
      // generic one.
      trustStore.addAuditLog('Marketplace Listing Saved As Draft', `Saved draft: "${title}"`);
      showAlert({
        type: 'info',
        title: 'Saved as a draft',
        message:
          outcome.detail ??
          'Your listing is saved, but it is not visible yet. Open it from your listings to finish and publish it.',
        buttons: [
          {
            text: 'Open my listings',
            onPress: () => {
              router.replace({ pathname: '/marketplace/[id]', params: { id: outcome.listingId } });
            },
          },
        ],
      });
    } catch (err) {
      setIsSubmitting(false);
      // The server's message, when there is one. The old branch replaced every
      // failure with "Please review the inputs" — which sent a member whose
      // seller profile could not be created back to re-read a form that was
      // never the problem.
      const msg =
        problemDetail(err) ?? 'Your listing could not be saved. Please check your connection and try again.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        showAlert({ type: 'error', title: 'Could not save listing', message: msg });
      }
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;
  const selectedCategoryObj = categoryCatalogue.find(category);
  const subcategoryOptions = categoryCatalogue.childrenOf(category);
  const getCurrencySymbol = () => {
    switch (currency) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'NGN': return '₦';
      case 'GHS': return '₵';
      case 'MUR': return 'Rs ';
      default: return `${currency} `;
    }
  };

  const handleNext = () => {
    // Special routing for Donation — go to dedicated causes screen
    if (currentStep === 0 && intent === 'Donation') {
      router.push('/marketplace/donation-causes' as any);
      return;
    }
    // Special routing for Exchange/Swap — go to dedicated swap flow screen
    if (currentStep === 0 && intent === 'Exchange / Swap') {
      router.push('/marketplace/swap-create' as any);
      return;
    }
    // No popups here any more. Every rule these seven `showAlert` calls
    // enforced is declared in `requiredByStep` and `problemsByStep`, shown on
    // the step while the member is on it, and enforced by the button being
    // inert — so there is nothing left to refuse at this point.

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  if (maySell === false) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="Sell an item" />
        <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: bottomInset }}>
          <Text className="text-lg font-black text-content-primary mb-2">Selling is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Listing an item needs a verified Diaspora account. Once your account is verified, you can
            list straight away.
          </Text>
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Stepper Progress Tracker */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post Marketplace Listing
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => {
              showToast({ type: 'success', title: 'Draft saved', message: 'It is on this phone. Find it in Creator Studio, under Drafts.' });
              backOr();
            }} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft Restore Alert */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Unfinished Draft</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Restore your previously saved marketplace draft details?
              </Text>
            </View>
            <View className="flex-row">
              <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3.5 py-2 rounded-xl mr-2">
                <Text className="text-xs font-bold text-white">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={discardDraft} className="bg-surface-muted border border-subtle px-3.5 py-2 rounded-xl">
                <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* STEP 1: Intent Selection */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the listing intent for this marketplace transaction. Admin-configurable types support flexible exchanges.
              </Text>
              {INTENTS.map((item) => {
                const isSel = intent === item.value;
                const isSpecial = item.value === 'Donation' || item.value === 'Exchange / Swap';
                return (
                  <TouchableOpacity
                    key={item.value}
                    onPress={() => setIntent(item.value as any)}
                    className={`p-4 mb-3 border rounded-2xl flex-row items-center justify-between active:scale-[0.99] ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <View className="flex-row items-center flex-1 mr-3">
                      <Text className="text-3xl mr-4">{item.icon}</Text>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className={`text-base font-extrabold ${isSel ? 'text-primary-500' : 'text-content-primary'}`}>
                            {item.label}
                          </Text>
                          {isSpecial && (
                            <View className="bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded-md">
                              <Text className="text-[9px] font-black text-primary-500">SPECIAL</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-content-muted mt-0.5 leading-relaxed">{item.desc}</Text>
                        {isSpecial && (
                          <Text className="text-[10px] text-primary-400 font-semibold mt-1">
                            {item.value === 'Donation' ? 'Opens dedicated charitable causes browser →' : 'Opens swap-specific listing form →'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View className={`w-5 h-5 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[10px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 2: Category & Condition */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Select the listing category and report the item condition. Subcategories support nested listings.
              </Text>

              {/* The shared dropdown with search (14 Oct 2026), the same control
                  every form uses to pick a category. Values are server keys. */}
              <SearchableSelect
                label="Product Category"
                placeholder="Select a category"
                searchPlaceholder="Search categories"
                options={categoryCatalogue.topCategories.map((cat) => ({
                  key: cat.key,
                  label: cat.name,
                  icon: marketplaceCategoryEmoji(cat.key),
                }))}
                value={category}
                onChange={(key) => {
                  setCategory(key);
                  if (key !== category) setSubcategory(''); // A subcategory belongs to its category.
                }}
                isLoading={categoryCatalogue.isLoading}
                testID="marketplace-category"
              />

              {category ? (
                <SearchableSelect
                  label="Subcategory (Optional)"
                  placeholder={subcategoryOptions.length > 0 ? 'Select a subcategory (optional)' : 'No subcategories'}
                  searchPlaceholder="Search subcategories"
                  options={subcategoryOptions.map((sub) => ({ key: sub.key, label: sub.name }))}
                  value={subcategory || null}
                  onChange={setSubcategory}
                  unavailableMessage="This category has no subcategories."
                  testID="marketplace-subcategory"
                />
              ) : null}

              <Input
                label="Brand (Optional)"
                placeholder="e.g. Apple, Nike, Samsung, IKEA"
                value={brand}
                onChangeText={setBrand}
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Item Condition</Text>
              {CONDITIONS.map((cond) => {
                const isSel = condition === cond.label;
                return (
                  <TouchableOpacity
                    key={cond.label}
                    onPress={() => setCondition(cond.label as any)}
                    className={`p-3.5 mb-3 border rounded-2xl flex-row items-center justify-between ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-sm font-extrabold text-content-strong">{cond.label}</Text>
                      <Text className="text-[11px] text-content-muted mt-0.5 leading-relaxed">{cond.desc}</Text>
                    </View>
                    <View className={`w-4 h-4 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[8px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 3: Product Information */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide core details about your listing, including price options.
              </Text>

              <Input
                label="Product Title"
                placeholder="e.g. iPhone 13 Pro Max - 128GB Unlocked"
                value={title}
                onChangeText={setTitle}
              />

              <Input
                label="Description"
                placeholder="Write a clear, detailed description highlighting any key features, defects, size or dimensions..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                className="h-24"
              />

              {intent !== 'Giving Away' && (
                <View>
                  <CurrencyNote currency={memberCurrency} />

                  {intent === 'Buying Request' || intent === 'Wanted' ? (
                    <View className="flex-row gap-4 mb-2">
                      <View className="flex-1">
                        <Input
                          label="Min Price"
                          placeholder="e.g. 100"
                          value={minPrice}
                          onChangeText={setMinPrice}
                          keyboardType="numeric"
                        />
                      </View>
                      <View className="flex-1">
                        <Input
                          label="Max Price"
                          placeholder="e.g. 300"
                          value={maxPrice}
                          onChangeText={setMaxPrice}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <Input
                        label="Price"
                        placeholder="e.g. 250"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="numeric"
                      />

                      {/* Negotiable Checkbox */}
                      <TouchableOpacity
                        onPress={() => setNegotiable(!negotiable)}
                        className="flex-row items-center mb-5 bg-surface-background p-3 rounded-xl border border-subtle"
                      >
                        <Text className="text-xs font-bold text-content-secondary flex-1">Price is Negotiable (Or Best Offer)</Text>
                        <Text className="text-base">{negotiable ? '✅' : '⬜'}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/*
                    Was "🤖 Run AI Price Valuation". The platform performs no
                    valuation and holds no price data — see `runListingCheck`
                    for what the old output actually computed. The button now
                    names what it does.
                  */}
                  <TouchableOpacity
                    onPress={runListingCheck}
                    className="bg-surface-inverse py-3.5 rounded-xl justify-center items-center mb-6 active:bg-black"
                  >
                    {aiLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text className="text-content-inverse font-extrabold text-xs">📋 Check this listing</Text>
                    )}
                  </TouchableOpacity>

                  {aiSuggestions && (
                    <View className="bg-surface-background border border-subtle p-4 rounded-2xl mb-6">
                      <Text className="text-xs text-content-secondary leading-relaxed font-semibold">{aiSuggestions}</Text>
                    </View>
                  )}
                </View>
              )}

              <Input
                label="Quantity Available"
                placeholder="e.g. 1"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
              />
            </View>
          )}

          {/* STEP 4: Location & landmark */}
          {currentStep === 3 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Confirm your local address, area neighborhood, and nearby landmarks. Location is the foundation of discovery.
              </Text>

              {/* The country is the member's residence, never asked (14 Oct 2026);
                  the town comes from the one shared search of towns in it. */}
              <TownPicker
                label="City"
                value={cityName}
                onChange={(town) => setCityName(town.cityName)}
                testID="marketplace-town"
              />

              <Input
                label="Neighborhood / Area"
                placeholder="e.g. Peckham, MediaCity, Sainte Croix, Ikeja"
                value={areaName}
                onChangeText={setAreaName}
              />

              <Input
                label="Address Line"
                placeholder="e.g. 42 Chapel Street"
                value={addressLine}
                onChangeText={setAddressLine}
              />

              <Input
                label="Nearby Landmark / Area Point"
                placeholder="e.g. Opposite the library, 2 mins from Metro"
                value={landmark}
                onChangeText={setLandmark}
              />

              <Text className="text-xs font-bold text-content-secondary mb-3">Map Picker Proximity Pin</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsSelectingPin(true);
                  setTimeout(() => {
                    setIsSelectingPin(false);
                    const coords = cityName === 'London'
                      ? { latitude: 51.4702, longitude: -0.0691 }
                      : cityName === 'Manchester' ? { latitude: 53.4789, longitude: -2.2923 }
                      : cityName === 'Lagos' ? { latitude: 6.5863, longitude: 3.3601 }
                      : { latitude: -20.1482, longitude: 57.5186 };
                    
                    setCoordinates(coords);
                    showAlert({ type: 'success', title: 'Map Location Saved', message: 'Simulated GPS coordinates locked successfully.' });
                  }, 800);
                }}
                className="h-36 bg-surface-background rounded-2xl border border-subtle overflow-hidden items-center justify-center"
              >
                {isSelectingPin ? (
                  <ActivityIndicator size="small" color="#F59300" />
                ) : (
                  <View className="items-center">
                    <Text className="text-3xl mb-1.5">🗺️</Text>
                    <Text className="text-xs font-bold text-content-tertiary">Simulated Location Map Picker</Text>
                    <Text className="text-[10px] text-content-faint mt-1 font-semibold">Tap to lock simulated GPS pin</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 5: Photos & Ordering */}
          {currentStep === 4 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Add photos for your listing. The first image will be set as the main cover photo.
              </Text>

              {/* Two controls, one design, and the same one the housing wizard
                  uses. Until today the cover was a solid-bordered 176px panel
                  and the gallery a 96px dashed third-width square reading
                  "➕ Add Photo" — two answers to one question, on one step,
                  and a third answer two screens away. */}
              <PhotoDropZone
                label="Cover Image"
                prompt="Tap to upload cover image"
                previewUri={coverPhoto?.previewUri ?? null}
                changeLabel="📷 Change Cover Photo"
                busy={coverBusy}
                busyLabel={
                  coverUpload.phase === 'processing'
                    ? 'Processing…'
                    : `Uploading ${Math.round(coverUpload.progress * 100)}%`
                }
                // The server's own sentence where it gave one — it knows whether
                // the file was too large, the wrong type or refused by a scanner,
                // and each needs a different next step from the member. Nothing
                // was added to the listing, and this is how they find that out.
                error={coverUpload.phase === 'failed' ? coverUpload.error : null}
                onPress={handleCoverPhotoSelect}
              />

              <PhotoDropZone
                label="Gallery Photos"
                prompt="Tap to add a gallery photo"
                busy={galleryBusy}
                busyLabel={
                  galleryUpload.phase === 'processing'
                    ? 'Processing…'
                    : `Uploading ${Math.round(galleryUpload.progress * 100)}%`
                }
                error={galleryUpload.phase === 'failed' ? galleryUpload.error : null}
                onPress={handleAddGalleryPhoto}
              >
                {/* Above the panel rather than inside it: these are an ordered
                    set the member has already built — order is what "◀ MOVE"
                    changes, and what the listing shows — and the panel is the
                    thing that adds to it. A photograph mid-upload is in neither,
                    so the wait is the panel's overlay. */}
                {galleryPhotos.length > 0 && (
                  <View className="flex-row flex-wrap gap-3 mb-3">
                    {galleryPhotos.map((photo, index) => (
                      <View
                        key={`${photo.mediaId}-${index}`}
                        className="w-[30%] h-24 bg-surface-muted rounded-xl overflow-hidden relative border border-subtle"
                      >
                        <Image
                          source={{ uri: photo.previewUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />

                        <TouchableOpacity
                          onPress={() => deleteGalleryPhoto(index)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove gallery photo ${index + 1}`}
                          className="absolute top-1 right-1 bg-black/60 w-5 h-5 rounded-full items-center justify-center"
                        >
                          <Text className="text-white text-[10px] font-bold">✕</Text>
                        </TouchableOpacity>

                        {index > 0 && (
                          <TouchableOpacity
                            onPress={() => reorderGallery(index)}
                            accessibilityRole="button"
                            accessibilityLabel={`Move gallery photo ${index + 1} earlier`}
                            className="absolute bottom-1 left-1 bg-surface-card/80 px-1 rounded"
                          >
                            <Text className="text-[8px] font-extrabold text-content-strong">
                              ◀ MOVE
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </PhotoDropZone>
            </View>
          )}

          {/* STEP 6: Contact preferences */}
          {currentStep === 5 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide secure contact information and select how you prefer to communicate with potential buyers.
              </Text>

              <PhoneInputWithCode
                label="Contact Phone Number"
                value={contactPhone}
                onChangePhone={setContactPhone}
                placeholder="7700 900000"
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-3">Preferred Contact Method</Text>
              {['in_app', 'phone', 'email'].map((method) => {
                const isSel = preferredContactMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    onPress={() => setPreferredContactMethod(method as any)}
                    className={`p-3.5 mb-3 border rounded-2xl flex-row items-center justify-between ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-strong capitalize">
                      {method === 'in_app' ? '💬 In-App Chat' : method === 'phone' ? '📞 Direct Call' : '✉️ Email Enquiry'}
                    </Text>
                    <View className={`w-4 h-4 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[8px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 7: Preview & Publish */}
          {currentStep === 6 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Review your marketplace listing details before publishing to the community.
              </Text>

              <View className="mb-6">
                <TradeSafetyNote />
              </View>

              {/* Listing Card Preview */}
              <View className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-6 p-4">
                {/* No cover, no picture. The preview used to render an Unsplash
                    photograph of somebody else's item here whether or not the
                    member had chosen one, which made a listing with no photo
                    look finished. */}
                {coverPhoto ? (
                  <Image source={{ uri: coverPhoto.previewUri }} style={{ width: '100%', height: 160, borderRadius: 16 }} contentFit="cover" />
                ) : (
                  <View className="w-full h-40 bg-surface-background border border-dashed border-line rounded-2xl items-center justify-center">
                    <Text className="text-xs font-bold text-content-muted">No cover photo added</Text>
                    <Text className="text-[10px] text-content-faint mt-1 font-semibold">Listings with a photo get far more replies</Text>
                  </View>
                )}
                <View className="mt-4">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                      {selectedCategoryObj?.name || 'Other'} · {intent}
                    </Text>
                    <View className="bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                      <Text className="text-[8px] font-bold text-[#2563EB] uppercase">{condition}</Text>
                    </View>
                  </View>
                  <Text className="text-lg font-extrabold text-content-primary leading-snug">{title || 'Untitled Item'}</Text>
                  <Text className="text-xs text-content-muted mt-1 font-semibold">📍 {areaName || cityName} · {cityName}</Text>
                  <Text className="text-base font-black text-primary-500 mt-2">
                    {intent === 'Giving Away'
                      ? 'FREE'
                      : intent === 'Buying Request' || intent === 'Wanted'
                      ? `${getCurrencySymbol()}${minPrice || '0'} - ${getCurrencySymbol()}${maxPrice || '0'}`
                      : `${getCurrencySymbol()}${price || '0'}`}
                    {negotiable && intent !== 'Giving Away' && intent !== 'Buying Request' && intent !== 'Wanted' && (
                      <Text className="text-[10px] font-bold text-success-default"> (Negotiable)</Text>
                    )}
                  </Text>
                </View>
              </View>

              <Button
                label={isSubmitting ? 'Publishing...' : (intent === 'Buying Request' || intent === 'Wanted' ? 'Publish Request' : 'Publish Listing')}
                onPress={handlePublish}
                disabled={isSubmitting || stillNeeded.length > 0 || !!stepProblem}
                variant="primary"
                className="py-4"
              />
            </View>
          )}

        </ScrollView>

        {/* Named on the step, while the member is on it.

            This used to be seven `showAlert` calls inside `handleNext`: the way
            to learn a field was required was to fill in everything else, tap
            the button, read a dialog, dismiss it, and go looking. */}
        {stillNeeded.length > 0 || stepProblem ? (
          <View className="px-6 pt-3 flex-row items-start">
            <Ionicons name="alert-circle-outline" size={14} color="#F59300" />
            <Text className="text-[11px] font-semibold text-content-tertiary ml-1.5 flex-1">
              {stepProblem ?? `Still needed: ${stillNeeded.join(', ')}`}
            </Text>
          </View>
        ) : null}

        {/* Next / Previous Sticky Row */}
        <View className="bg-surface-card border-t border-faint p-4 flex-row justify-between items-center px-6">
          {currentStep > 0 ? (
            <TouchableOpacity
              onPress={() => setCurrentStep(currentStep - 1)}
              className="px-5 py-3 bg-surface-background border border-subtle rounded-xl"
            >
              <Text className="text-xs font-bold text-content-tertiary">Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          {currentStep < steps.length - 1 ? (
            <TouchableOpacity
              onPress={handleNext}
              disabled={stillNeeded.length > 0 || !!stepProblem}
              accessibilityRole="button"
              accessibilityState={{ disabled: stillNeeded.length > 0 || !!stepProblem }}
              className={`px-6 py-3 rounded-xl ${
                stillNeeded.length > 0 || stepProblem ? 'bg-surface-muted' : 'bg-primary-500'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  stillNeeded.length > 0 || stepProblem ? 'text-content-faint' : 'text-white'
                }`}
              >
                Next Step
              </Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
