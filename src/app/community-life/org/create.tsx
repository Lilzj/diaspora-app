import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeatureGate } from '@/components/FeatureGate';
import { apiClient } from '@/lib/apiClient';
import type { OrgCategory, OrgFormState } from '@/types/community-life';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';
import { useLocationStore, getActiveLocation } from '@/store/location';
import { useAuthStore } from '@/store/auth';
import { toOrganizationTypeKey } from '@/lib/community-life-catalogue';

const ORG_CATEGORIES: OrgCategory[] = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants', 'Other'
];

/**
 * The four answers `MembershipPolicyKind` allows, in the platform's own words.
 *
 * Not a client invention: `Open`, `RequestToJoin`, `InviteOnly` and `Closed`
 * are the enum, and the organisation profile renders whichever one comes back.
 */
const MEMBERSHIP_POLICIES = [
  {
    value: 'Open',
    label: 'Anyone, straight away',
    hint: 'People join without waiting for anybody to approve them.',
  },
  {
    value: 'RequestToJoin',
    label: 'Anyone may ask',
    hint: 'People ask to join and an administrator decides.',
  },
  {
    value: 'InviteOnly',
    label: 'Only people you invite',
    hint: 'Nobody can ask. Administrators add members.',
  },
  {
    value: 'Closed',
    label: 'Nobody, for now',
    hint: 'Your page stays up and the door is shut. You can reopen it later.',
  },
] as const;

export default function CreateOrgScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  // Category Selector Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = ORG_CATEGORIES.filter(cat => 
    cat.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Form State
  const [formData, setFormData] = useState<OrgFormState>({
    category: 'Associations',
    name: '',
    summary: '',
    description: '',
    mission: '',
    // Remediation Wave E. Both were Unsplash URLs, so an organisation created
    // without a logo shipped with a stock one that looked like a choice. They
    // now hold a `mediaId` or nothing.
    logo: '',
    coverImage: '',
    services: [],
    // ── Empty, not London ──────────────────────────────────────────────────
    //
    // These were hardcoded to 'London' and 'Peckham'. A member registering a
    // Mauritian association opened this form already claiming a Peckham address,
    // and anyone who skipped the place step submitted one.
    cityName: '',
    areaName: '',
    addressLine: '',
    countryCode: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    // **The three hardcoded opening-hours rows are gone.** They were a constant
    // with no editor behind it and no payload in front of it: nobody could
    // change them and nothing sent them. Worse than dead — had they ever been
    // sent, the platform would have recorded "Monday - Friday, 09:00 - 17:00"
    // for a mosque, a food bank and a students' union alike, none of whom had
    // said so.
    //
    // Hours are set on the organisation's own profile, where the owner can
    // state them, against `PUT /organizations/{id}/operating-hours`.
    verificationDocument: '',
    // How this body takes members, which is a real choice the request accepts.
    membershipPolicy: 'RequestToJoin',
    membershipRequirements: ''
  });

  const activeLocation = useLocationStore(getActiveLocation);
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);

  // `CreateOrganizationRequest.CountryCode` is required and this form has no
  // country step, so it comes from where the member says they live — the same
  // default the event form uses. Blank only; never overwrites.
  useEffect(() => {
    if (!residenceCountry) return;
    setFormData((prev) => (prev.countryCode ? prev : { ...prev, countryCode: residenceCountry }));
  }, [residenceCountry]);

  // Fill the place from the member's active discovery location — a place they
  // chose, or one the handset measured. Blanks only; never overwrites typing.
  useEffect(() => {
    if (!activeLocation) return;
    setFormData((prev) => ({
      ...prev,
      cityName: prev.cityName || activeLocation.cityName,
      areaName: prev.areaName || activeLocation.neighborhood,
    }));
  }, [activeLocation]);

  const updateField = (key: keyof OrgFormState, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    } else {
      router.back();
    }
  };

  // Draft Auto-saving Action
  /**
   * The create payload, with the logo and cover as media references.
   *
   * Remediation Wave E. `CreateOrganizationRequest` has **no `logo` or
   * `coverImage` property** — it has `Media: [{ mediaId, role, caption }]`. The
   * two strings this screen posted were dropped by System.Text.Json and the
   * write succeeded, so every organisation created here has had neither.
   *
   * Order matters only within a role, and each of these is the single asset in
   * its own, so neither carries a position.
   */
  /**
   * The request `POST /community-life/organizations` actually accepts.
   *
   * **This used to spread the whole form and add a `status`.** Not one of the
   * server's four required fields was among them: `Summary` and `CountryCode`
   * had no form field at all, `OrganizationTypeKey` was sent as `category`
   * carrying a display name like "Associations", and the rest — `addressLine`,
   * `openingHours`, `verificationDocument`, `hasMembershipPlans`, `status` —
   * are not fields on the request.
   *
   * So **every attempt to register an organisation was refused with a 400**,
   * and the catch said "Failed to register community hub" without naming a
   * cause a member could act on. It is why the platform has no organisations
   * on it: nobody has ever managed to create one.
   *
   * The same shape of defect the event create had, on the sibling screen,
   * fixed the same way: build the server's request, and let the server's own
   * `detail` explain a refusal.
   */
  const buildPayload = () => {
    const media: { mediaId: string; role: string }[] = [];
    if (formData.logo) media.push({ mediaId: formData.logo, role: 'Logo' });
    if (formData.coverImage) media.push({ mediaId: formData.coverImage, role: 'Cover' });

    return {
      name: formData.name.trim(),
      summary: formData.summary.trim(),
      description: formData.description.trim() || undefined,
      organizationTypeKey: toOrganizationTypeKey(formData.category),
      countryCode: formData.countryCode.trim().toUpperCase(),
      cityName: formData.cityName.trim() || undefined,
      // The form asks for an "area"; the request spells the nearest thing
      // `regionName`. A neighbourhood proper is a catalogue row with an id,
      // which a typed area is not.
      regionName: formData.areaName.trim() || undefined,
      mission: formData.mission.trim() || undefined,
      contact: {
        phone: formData.phone?.trim() || undefined,
        whatsApp: formData.whatsapp?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        website: formData.website?.trim() || undefined,
      },
      services: formData.services,
      // **Accepted by the request all along, and never sent.** In its place the
      // form had a "Hub Membership Programs (Future)" toggle writing to a
      // `hasMembershipPlans` field the request has never declared. Paid plans
      // are real — a *programme* on the organisation, set up afterwards — but
      // a boolean at registration was never how one is created, and this is
      // the question the create request actually asks.
      membershipPolicy: formData.membershipPolicy,
      membershipRequirements: formData.membershipRequirements?.trim() || undefined,
      // Accepted by the request all along. The form's inputs were unbound, so
      // nothing ever reached this object.
      socialLinks: {
        facebook: formData.facebook?.trim() || undefined,
        instagram: formData.instagram?.trim() || undefined,
        twitter: formData.twitter?.trim() || undefined,
      },
      media,
    };
  };

  /**
   * What the server needs before it will accept anything.
   *
   * Checked here rather than left to the 400, because a required field the form
   * never asked for produces an error the member cannot act on — which is what
   * this screen did for every submission it has ever made.
   */
  const missingRequired = (): string | null => {
    if (!formData.name.trim()) return 'Give the organisation a name.';
    if (!formData.summary.trim()) {
      return 'Add a one-line summary — it is what people see in a list.';
    }
    // **There is no country field on this form.** It is filled from where the
    // member says they live, so an account without a residence reached six
    // steps, tapped Publish, and was told to choose something that appears
    // nowhere on the screen. The sentence now names the place it can be
    // chosen, which is the only place it can be.
    if (!formData.countryCode.trim()) {
      return 'Your account has no country of residence, and an organisation is filed under one. Set it in your profile, then come back — what you have typed is kept.';
    }
    return null;
  };

  /**
   * What each step will not go forward without, by the name above the field.
   *
   * <p>
   * Each of these was an alert fired after the member had already tapped
   * Continue, titled "Validation Error", which names the category of problem
   * rather than the field. Step 1 is the kind of organisation, defaulted rather
   * than blank; steps 4 to 6 collect contact details and a review, none of
   * which the platform refuses a draft without.
   * </p>
   */
  const requiredByStep: Record<number, { label: string; ok: boolean }[]> = {
    1: [],
    2: [
      { label: 'Organization Name', ok: formData.name.trim().length > 0 },
      { label: 'One-line summary', ok: formData.summary.trim().length > 0 },
      { label: 'Description', ok: formData.description.trim().length > 0 },
    ],
    3: [{ label: 'Address Line', ok: formData.addressLine.trim().length > 0 }],
    4: [],
    5: [],
    6: [],
  };

  const stillNeeded = (requiredByStep[step] ?? [])
    .filter((field) => !field.ok)
    .map((field) => field.label);

  /**
   * Every step at once, at the last one.
   *
   * A member can walk back, empty the name and walk forward again; and the
   * country has no field to be missing from, so it can only be said here.
   */
  const valueProblem = stillNeeded.length > 0 ? null : step === 6 ? missingRequired() : null;

  const handleSaveDraft = async () => {
    const missing = missingRequired();
    if (missing) {
      showAlert({ type: 'error', title: 'Not saved', message: missing });
      return;
    }

    setIsDraftSaving(true);
    try {
      await apiClient.post('/community-life/organizations', buildPayload());
      showAlert({
        type: 'success',
        title: 'Draft saved',
        message: 'Saved as a private draft. Nobody else can see it yet.',
      });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not saved',
        message: detail?.trim() || 'The draft could not be saved. Your details are still here.',
      });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handlePublish = async () => {
    const missing = missingRequired();
    if (missing) {
      showAlert({ type: 'error', title: 'Not created', message: missing });
      return;
    }

    setIsSubmitting(true);
    try {
      // Creating always produces a draft — there is no `publish` flag on the
      // request, and publishing is its own route. The copy says so rather than
      // implying the profile is live.
      const created = await apiClient.post('/community-life/organizations', buildPayload());
      // **Somewhere to go afterwards.** This used to land on a generic success
      // page, and since nothing in the client calls `GET /organizations/mine`,
      // a member who registered an organisation had no way back to it — it
      // existed, and they could not find it. The response carries the profile.
      const organizationId: string | undefined = created?.data?.data?.organizationId;

      showAlert({
        type: 'success',
        title: 'Organisation created',
        message: 'Saved as a draft — nobody else can see it yet.',
        buttons: [
          {
            text: 'Done',
            onPress: () =>
              router.replace(
                organizationId
                  ? (`/community-life/org/${organizationId}` as never)
                  : ('/listing-success' as never)
              ),
          },
        ],
      });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not created',
        message:
          detail?.trim() || 'The organisation could not be created. Your details are still here.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureGate featureName="Organizations">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-faint flex-row items-center justify-between bg-surface-card shadow-sm">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={handleBack} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-black text-content-primary tracking-tight">Register Hub</Text>
            <Text className="text-[10px] text-content-muted font-bold uppercase">Step {step} of 6</Text>
          </View>
        </View>

        {/* Auto-save draft action */}
        <TouchableOpacity
          onPress={handleSaveDraft}
          disabled={isDraftSaving}
          className="bg-surface-muted px-3 py-1.5 rounded-xl border border-subtle flex-row items-center"
        >
          {isDraftSaving ? (
            <ActivityIndicator size="small" color="#F59300" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={13} color={tokens.color.text.secondary} className="mr-1" />
              <Text className="text-[10px] font-black text-content-tertiary">SAVE DRAFT</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View className="h-1 bg-surface-muted w-full">
        <View
          className="h-full bg-primary-500"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </View>

      {isSubmitting ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#F59300" />
          <Text className="text-xs text-content-faint font-semibold mt-3">Registering Community Hub...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
        >
          <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* STEP 1: CATEGORY */}
          {step === 1 && (
            <View>
              <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Select Hub Category</Text>
              <Text className="text-xs text-content-faint font-semibold mb-5">Categorize your organization so members can locate you.</Text>
              
              {/* Dropdown Selector Trigger */}
              <TouchableOpacity
                onPress={() => setIsDropdownOpen(true)}
                className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-4 active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                    <Ionicons name="business-outline" size={16} color="#F59300" />
                  </View>
                  <Text className="text-sm font-extrabold text-content-strong">
                    {formData.category || 'Select a hub category...'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: BASIC INFO */}
          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Hub Details</Text>
                <Text className="text-xs text-content-faint font-semibold">Introduce your mission and services to members.</Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Organization Name</Text>
                <TextInput
                  placeholder="e.g. London African Sports Association"
                  value={formData.name}
                  onChangeText={(val) => updateField('name', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Mission Statement</Text>
                <TextInput
                  placeholder="e.g. Connecting communities through sports and cultural events..."
                  value={formData.mission}
                  onChangeText={(val) => updateField('mission', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">
                  One-line summary
                </Text>
                <TextInput
                  placeholder="e.g. A Mauritian cultural association in Port Louis"
                  value={formData.summary}
                  onChangeText={(val) => updateField('summary', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  maxLength={200}
                />
                <Text className="text-[10px] text-content-muted font-semibold mt-1.5">
                  What people see beside your name in a list.
                </Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Description</Text>
                <TextInput
                  placeholder="Tell the community about your history, weekly programs, and other details..."
                  value={formData.description}
                  onChangeText={(val) => updateField('description', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ImagePickerInput
                    label="Logo"
                    value={formData.logo}
                    onChangeImage={(uri) => updateField('logo', uri)}
                    aspect={[1, 1]}
                    circle
                  />
                </View>
                <View className="flex-1">
                  <ImagePickerInput
                    label="Cover Image"
                    value={formData.coverImage}
                    onChangeImage={(uri) => updateField('coverImage', uri)}
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: LOCATION */}
          {step === 3 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Hub Location</Text>
                <Text className="text-xs text-content-faint font-semibold">Where can members visit your organization?</Text>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">City</Text>
                  <TextInput
                    placeholder="e.g. London"
                    value={formData.cityName}
                    onChangeText={(val) => updateField('cityName', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Area / Neighborhood</Text>
                  <TextInput
                    placeholder="e.g. Rose Hill, Peckham, East Legon"
                    value={formData.areaName}
                    onChangeText={(val) => updateField('areaName', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Address Line</Text>
                <TextInput
                  placeholder="Street address, building number..."
                  value={formData.addressLine}
                  onChangeText={(val) => updateField('addressLine', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 4: CONTACT & SOCIALS */}
          {step === 4 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Contact & Social Channels</Text>
                <Text className="text-xs text-content-faint font-semibold">Help diaspora members consult or reach your leadership.</Text>
              </View>

              <View>
                <PhoneInputWithCode
                  label="Phone"
                  value={formData.phone || ''}
                  onChangePhone={(val) => updateField('phone', val)}
                  placeholder="7700 900000"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Email Address</Text>
                  <TextInput
                    placeholder="contact@mygroup.org"
                    value={formData.email}
                    onChangeText={(val) => updateField('email', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Website</Text>
                  <TextInput
                    placeholder="https://..."
                    value={formData.website}
                    onChangeText={(val) => updateField('website', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
              </View>

              {/* Social Channels placeholders */}
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">
                  Social media links
                </Text>
                {/* These two had no `value` and no `onChangeText`: a member
                    typed a link and it went nowhere, not even into form state.
                    The label also promised a Twitter field that did not exist.
                    All three are bound and all three are sent. */}
                <TextInput
                  placeholder="Facebook link"
                  value={formData.facebook}
                  onChangeText={(val) => updateField('facebook', val)}
                  autoCapitalize="none"
                  keyboardType="url"
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong mb-2"
                />
                <TextInput
                  placeholder="Instagram link"
                  value={formData.instagram}
                  onChangeText={(val) => updateField('instagram', val)}
                  autoCapitalize="none"
                  keyboardType="url"
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong mb-2"
                />
                <TextInput
                  placeholder="Twitter link"
                  value={formData.twitter}
                  onChangeText={(val) => updateField('twitter', val)}
                  autoCapitalize="none"
                  keyboardType="url"
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 5: VERIFICATION */}
          {step === 5 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Identity Verification</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">To unlock the verified badge and directory priority, upload official documents.</Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Charity or Corporate Registration ID</Text>
                <TextInput
                  placeholder="e.g. Charity Commission ID, corporate register number"
                  value={formData.verificationDocument}
                  onChangeText={(val) => updateField('verificationDocument', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View className="bg-surface-background border border-subtle border-dashed rounded-2xl p-6 items-center justify-center mt-2">
                <Ionicons name="shield-checkmark-outline" size={32} color="#10B981" />
                <Text className="text-xs font-black text-content-secondary mt-2">
                  Verification is reviewed by hand
                </Text>
                <Text className="text-[10px] text-content-muted mt-0.5 text-center max-w-[240px]">
                  Your organisation is saved as a draft. Once an administrator has
                  verified it, it shows the trust checkmark.</Text>
              </View>
            </View>
          )}

          {/* STEP 6: PREVIEW & PUBLISH */}
          {step === 6 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Preview & Publish Hub</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">Review your organization profile before sharing.</Text>
              </View>

              <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-subtle justify-center items-center mr-3">
                  <Ionicons name="home" size={20} color="#6B7280" />
                </View>
                <View className="flex-1">
                  <Text className="text-[9px] font-black text-primary-500 uppercase">{formData.category}</Text>
                  <Text className="text-sm font-black text-content-primary mt-0.5">{formData.name || 'Untitled Organization'}</Text>
                  <Text className="text-[10px] text-content-muted font-bold mt-0.5">📍 {formData.areaName}</Text>
                </View>
              </View>

              {/*
                **Who may join, which is a decision the platform stores.**

                This was a toggle headed "Hub Membership Programs (Future)"
                writing to a `hasMembershipPlans` field
                `CreateOrganizationRequest` has never declared, so it sent
                nothing. Priced membership plans are not future either — they
                are a *programme* on the organisation, with tiers and renewals,
                set up after registration rather than switched on during it.

                `MembershipPolicy` is on the request and is one of four real
                answers. The default is RequestToJoin: the safest of the four
                for a body that has not thought about it, because it admits
                nobody without a person deciding.
              */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mt-2">
                <Text className="text-xs font-black text-content-secondary">Who may join</Text>
                <Text className="text-[10px] text-content-muted font-bold mt-0.5">
                  You can change this later.
                </Text>

                <View className="gap-2 mt-3">
                  {MEMBERSHIP_POLICIES.map((option) => {
                    const isChosen = formData.membershipPolicy === option.value;

                    return (
                      <TouchableOpacity
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isChosen }}
                        accessibilityLabel={`${option.label}. ${option.hint}`}
                        onPress={() => updateField('membershipPolicy', option.value)}
                        className={`rounded-xl p-3 border ${
                          isChosen ? 'border-primary-500 bg-primary-50' : 'border-subtle'
                        }`}
                      >
                        <Text
                          className={`text-xs font-black ${
                            isChosen ? 'text-primary-500' : 'text-content-secondary'
                          }`}
                        >
                          {option.label}
                        </Text>
                        <Text className="text-[10px] text-content-muted font-semibold mt-0.5 leading-relaxed">
                          {option.hint}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {formData.membershipPolicy === 'RequestToJoin' ||
                formData.membershipPolicy === 'InviteOnly' ? (
                  <TextInput
                    placeholder="What you ask of a member — optional"
                    value={formData.membershipRequirements}
                    onChangeText={(value) => updateField('membershipRequirements', value)}
                    accessibilityLabel="What this organisation asks of a member"
                    className="bg-surface-card border border-subtle rounded-xl p-3 text-xs font-semibold text-content-strong mt-3"
                  />
                ) : null}
              </View>
            </View>
          )}

          {/* Buttons action group */}
          <View className="mt-8 mb-10">
            {stillNeeded.length > 0 ? (
              <Text className="text-xs font-semibold text-content-muted mb-3">
                Still needed: {stillNeeded.join(', ')}
              </Text>
            ) : valueProblem ? (
              <Text className="text-xs font-semibold text-content-muted mb-3">{valueProblem}</Text>
            ) : null}

            <View className="flex-row gap-3">
              {step > 1 && (
                <Button
                  label="Back"
                  variant="outline"
                  className="flex-1"
                  onPress={handleBack}
                />
              )}
              <Button
                label={step === 6 ? 'Publish' : 'Continue'}
                className="flex-1"
                isLoading={isSubmitting}
                disabled={stillNeeded.length > 0 || valueProblem !== null}
                onPress={step === 6 ? handlePublish : handleNext}
              />
            </View>
          </View>

         </ScrollView>
        </KeyboardAvoidingView>
      )}
      {/* Category Bottom Sheet Modal */}
      <Modal
        visible={isDropdownOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsDropdownOpen(false);
          setSearchQuery('');
        }}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setIsDropdownOpen(false);
            setSearchQuery('');
          }}
          className="flex-1 justify-end bg-black/50"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-[32px] h-[60%] max-h-[500px] p-6 shadow-2xl w-full">
              {/* Drag Handle Indicator */}
              <View className="w-12 h-1 bg-subtle rounded-full mx-auto mb-5" />

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-content-primary">Select Hub Category</Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsDropdownOpen(false);
                    setSearchQuery('');
                  }}
                  className="p-1"
                >
                  <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 py-2.5 mb-4">
                <Ionicons name="search" size={16} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 text-xs font-semibold text-content-primary p-0"
                  placeholderTextColor={tokens.color.text.placeholder}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Options List */}
              <ScrollView className="flex-1 py-1" showsVerticalScrollIndicator={false}>
                {filteredCategories.map((cat) => {
                  const isSelected = formData.category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => {
                        updateField('category', cat);
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                      }}
                      className={`flex-row items-center justify-between p-3.5 my-1 rounded-2xl ${
                        isSelected ? 'bg-primary-50' : 'active:bg-surface-background'
                      }`}
                    >
                      <Text className={`text-xs ${isSelected ? 'text-primary-500 font-extrabold' : 'text-content-secondary font-bold'}`}>
                        {cat}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color="#F59300" />}
                    </TouchableOpacity>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <View className="p-8 items-center justify-center">
                    <Text className="text-xs text-content-muted font-bold">No categories match your search</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      </SafeAreaView>
    </FeatureGate>
  );
}
