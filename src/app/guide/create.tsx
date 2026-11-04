// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-3 — the create wizard now publishes to the server.
//
// ── What this screen did before ─────────────────────────────────────────────
//
// `handlePublish` ran a local `TrustEngine` rate-limit check, ran a local
// image-reuse check, cleared a module-level draft variable, computed a
// "content trust level" from the local reputation store, wrote two entries into
// `store/trust.ts`, and showed:
//
//     "Your guide has been published immediately to the Diaspora network."
//
// **It made no request.** There was no guides client, no guides hook and no
// `/guides` handler; nothing left the device. A member wrote a guide over
// several sessions, pressed Publish, was congratulated, and had produced
// nothing — the wizard's own draft was even cleared on the way out, so the text
// was gone too. That is the live inert affordance this wave exists to remove.
//
// The wizard's inputs were fixtures as well: the country picker read
// `mockAuthors['user-123'].countryVerifications` — a fixture keyed on a
// hard-coded member id — and the category chips read `mocks/data`'s marketplace
// categories, which are not the guide catalogue and share not one key with it.
//
// ── What it does now ────────────────────────────────────────────────────────
//
// Publish calls `usePublishNewGuide`, which is `lib/guides-api.ts`'s
// `publishNewGuide`: **create → save content → attach the hero → set tags →
// publish**, in that order, each awaited. `POST /guides` opens a *draft* and
// carries no content and no media, so the sequence is not an optimisation — it
// is the only way the contract allows a guide to reach a reader.
//
// The success alert is inside `onSuccess`. If any required step fails the
// member is told **which**, and — from the second step onwards — that their work
// is saved as a draft they can finish. A guide that did not publish is never
// reported as published, and the local draft is cleared only after the server
// has confirmed.
//
// The country picker now reads Trust's `countryReputations`, which is what
// `GET /trust/profile` actually returns, and the category chips read
// `GET /guides/categories` — the catalogue whose **keys** the create request
// requires. `mocks/data`'s categories would have produced
// `guides.category.not-found` on every attempt.
//
// ── Who may write one — 15 Sep 2026 ─────────────────────────────────────────
//
// The `TrustEngine` gate is gone. It was asked about a hard-coded 'GB' whatever
// country the member lives in, against thresholds — 150 points, two years,
// verified residency — that the Guides service never checked and no member could
// meet, and the country step offered only verified residencies, which nobody
// had. The screen now asks what the server asks: the `guides.publish` feature,
// granted to verified accounts. See `lib/guide-countries.ts` for the countries.
//
// The five "AI" panels stay simulated and are labelled as suggestions in the
// interface. They write nothing and claim nothing about the guide's quality on
// the server.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { WizardFooter } from '@/components/forms/WizardFooter';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { Input } from '@/components/Input';
import { useTrustStore } from '@/store/trust';
import { useTrustProfile } from '@/hooks/trust';
import { TrustEngine } from '@/lib/trustEngine';
import { useAuthStore } from '@/store/auth';
import { countryByCode } from '@/lib/calling-code';
import { guideCountryOptions } from '@/lib/guide-countries';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { Ionicons } from '@expo/vector-icons';
import { useThemeTokens } from '@/design-system';
import { useGuideCategories, usePublishNewGuide } from '@/hooks/guides';
import {
  GUIDE_SUMMARY_MAX_LENGTH,
  GUIDE_TITLE_MAX_LENGTH,
  GUIDE_TITLE_MIN_LENGTH,
  GUIDE_WORDS_PER_MINUTE,
  GuidePublishError,
  guideErrorMessage,
  hasPublishableContent,
} from '@/lib/guides-api';
import {
  composeGuideDocument,
  documentWordCount,
  exceedsBlockLimit,
  newDocumentId,
} from '@/lib/guide-composer';

// Module-level global storage for guide drafts
let globalGuideDraft: any = null;

// No Country step since 14 Oct 2026: a guide is filed under the country the
// member lives in. The step offered residence and origin both, and a member
// in Mauritius was asked to choose between two countries for no reason.
const steps = ['Category', 'Basics', 'Write Content', 'Review & Preview'];

export default function CreateGuideScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const trustStore = useTrustStore();

  // Whether this member may publish a guide, as the Guides service itself says:
  // the `guides.publish` feature on their access decision, which it grants to
  // verified accounts. Null until the session is restored — an unanswered
  // question is not a no, and the server still refuses a guide it does not allow.
  const access = useAuthStore((state) => state.access);
  const mayPublish = access ? access.grantedFeatures.includes('guides.publish') : null;

  // Trust's country standings, read only to offer those countries as well.
  const { profile } = useTrustProfile();
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);
  const nationality = useAuthStore((state) => state.user?.nationality);


  // ── The catalogue the create request actually validates against ───────────
  //
  // `CreateGuideRequest.categoryKey` is checked against the *guide* catalogue,
  // and the handler answers `guides.category.not-found` for anything else. The
  // chips used to be `mocks/data`'s marketplace categories — "Food &
  // Restaurants", "Hair & Beauty" — which share no key with it, so every
  // attempt would have been refused had the screen ever made one.
  //
  // `selectable` rather than `categories`: an inactive category is one **new**
  // guides may not be filed under, though existing guides keep it.
  const { selectable: categories, isLoading: categoriesLoading } = useGuideCategories();

  const publish = usePublishNewGuide();

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Form States
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  /** The catalogue **key**, not the display name. It is what the request carries. */
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  /** A `mediaId` from `ImagePickerInput`. **Never a URI** — see that component. */
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [content, setContent] = useState('');

  // ── The countries a guide can be filed under ─────────────────────────────
  //
  // Where the member lives, where they are from, and any country Trust holds a
  // standing for — not only verified residencies, which nobody had, so this step
  // used to be locked for every member.
  const countryOptions = useMemo(
    () =>
      guideCountryOptions({
        residence: residenceCountry,
        origin: nationality,
        standings: profile?.countryReputations,
      }),
    [residenceCountry, nationality, profile]
  );

  /**
   * The section and block identifiers this draft uses.
   *
   * Held across renders because `GuideSectionInput.sectionId` is "supplied by
   * the client and stable across saves — it is what version diffs match sections
   * by". Minting a fresh one on every keystroke would make the guide's first
   * version history read as a full replacement of a document that never existed.
   */
  const documentIds = useRef<{ sectionId: string; blockIds: string[] }>({
    sectionId: newDocumentId(),
    blockIds: [],
  });

  // AI Assistant Mock States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Check draft on mount. The country is auto-selected in its own effect below,
  // because the profile it depends on arrives after this one runs.
  useEffect(() => {
    if (globalGuideDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Start on the country the member lives in.
  //
  // `selectedCountry` holds the **code**, not the name: `CreateGuideRequest`
  // takes an upper-case ISO 3166-1 alpha-2 and refuses anything else with
  // `guides.country.invalid`. The screen renders the name beside the flag.
  useEffect(() => {
    if (globalGuideDraft) return;
    if (residenceCountry && selectedCountry !== residenceCountry) {
      setSelectedCountry(residenceCountry);
      return;
    }
    if (selectedCountry) return;
    if (countryOptions.length > 0) {
      setSelectedCountry(countryOptions[0].countryCode);
    }
  }, [countryOptions, selectedCountry]);

  // Save draft state periodically
  const saveDraft = () => {
    globalGuideDraft = {
      selectedCountry,
      selectedCategory,
      title,
      summary,
      coverImage,
      content,
      currentStep,
    };
  };

  useEffect(() => {
    if (title || content || selectedCountry) {
      saveDraft();
    }
  }, [selectedCountry, selectedCategory, title, summary, coverImage, content]);

  const restoreDraft = () => {
    if (globalGuideDraft) {
      const d = globalGuideDraft;
      setSelectedCountry(d.selectedCountry);
      setSelectedCategory(d.selectedCategory);
      setTitle(d.title);
      setSummary(d.summary);
      setCoverImage(d.coverImage);
      setContent(d.content);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalGuideDraft = null;
    setDraftBannerVisible(false);
  };

  // AI Assistant helpers
  const triggerAiAction = (actionType: string) => {
    setAiLoading(true);
    setAiSuggestions(null);
    let text = '';
    let result = '';

    if (actionType === 'outline') {
      text = 'Analyzing topic and generating outline...';
      result = `💡 Suggested Outline for "${title || 'Your Guide'}":\n\n1. Introduction & Historical Context\n2. Key Requirements & Documentation\n3. Step-by-Step Walkthrough\n4. Common Mistakes to Avoid\n5. Local Resources & Forums`;
    } else if (actionType === 'improve') {
      text = 'Analyzing text and polishing syntax...';
      result = '✨ Polish Suggestions:\n- Try replacing "really simple to do" with "straightforward to implement".\n- Simplify paragraph 2 to improve overall readability scores.';
    } else if (actionType === 'title') {
      text = 'Synthesizing guide details for title ideas...';
      // The guide's country by name — the one chosen, else where the member
      // lives. It was the raw code with 'UK' and 'Mauritius' as fallbacks.
      const place =
        countryByCode(selectedCountry ?? residenceCountry)?.name ?? 'your new country';
      result = `📝 Suggested Titles:\n- 💡 Settlement Blueprint: Settling in ${place}\n- 🏠 Navigating Accommodation in ${place} 101\n- 🚀 The Diaspora Handbook: Finding Community`;
    } else if (actionType === 'summarize') {
      text = 'Drafting quick executive summary...';
      result = '📌 Executive Summary:\nThis guide provides a comprehensive overview of local services and community-verified tips for new arrivals.';
    } else {
      text = 'Checking verification date stamps...';
      result = '🔍 Outdated Check:\nImmigration fees and transport links were last updated 12 months ago. Consider verifying with new data.';
    }

    setAiLoadingText(text);

    setTimeout(() => {
      setAiLoading(false);
      setAiSuggestions(result);
    }, 1500);
  };

  // Simulated Rich Text Tag appends
  const insertTag = (tagType: string) => {
    let startTag = '';
    let endTag = '';

    if (tagType === 'tip') {
      startTag = '\n[TIP]';
      endTag = 'Write your helpful tip here...[/TIP]\n';
    } else if (tagType === 'warning') {
      startTag = '\n[WARNING]';
      endTag = 'Write your caution note here...[/WARNING]\n';
    } else if (tagType === 'callout') {
      startTag = '\n[CALLOUT]';
      endTag = 'Highlight this information here...[/CALLOUT]\n';
    } else if (tagType === 'bullet') {
      startTag = '\n- Item 1\n- Item 2\n';
    } else if (tagType === 'image') {
      startTag = '\n[IMAGE]';
      endTag = 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600[/IMAGE]\n';
    } else {
      startTag = '\n[LINK]';
      endTag = 'View Portal Name | https://portal.com[/LINK]\n';
    }

    setContent((prev) => prev + startTag + endTag);
  };

  // Custom live parser to display text formatted blocks
  const parseRichPreview = (rawText: string) => {
    if (!rawText) return <Text className="text-content-faint italic">No content written yet. Use the formatting toolbar to write your guide.</Text>;

    const tokens = rawText.split(/(\[TIP\][\s\S]*?\[\/TIP\]|\[WARNING\][\s\S]*?\[\/WARNING\]|\[CALLOUT\][\s\S]*?\[\/CALLOUT\]|\[IMAGE\][\s\S]*?\[\/IMAGE\]|\[LINK\][\s\S]*?\[\/LINK\])/g);

    return tokens.map((token, index) => {
      if (token.startsWith('[TIP]')) {
        const textContent = token.replace('[TIP]', '').replace('[/TIP]', '').trim();
        return (
          <View key={index} className="bg-surface-muted border-l-4 border-success-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-success-default uppercase tracking-wider mb-1">💡 Pro-Tip</Text>
            <Text className="text-sm text-content-strong leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[WARNING]')) {
        const textContent = token.replace('[WARNING]', '').replace('[/WARNING]', '').trim();
        return (
          <View key={index} className="bg-surface-muted border-l-4 border-error-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-error-default uppercase tracking-wider mb-1">⚠️ Important Warning</Text>
            <Text className="text-sm text-content-strong leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[CALLOUT]')) {
        const textContent = token.replace('[CALLOUT]', '').replace('[/CALLOUT]', '').trim();
        return (
          <View key={index} className="bg-surface-muted border-l-4 border-info-default p-3 rounded-r-xl my-2">
            <Text className="text-xs font-bold text-info-default uppercase tracking-wider mb-1">ℹ️ Notice Info</Text>
            <Text className="text-sm text-content-strong leading-relaxed">{textContent}</Text>
          </View>
        );
      }
      if (token.startsWith('[IMAGE]')) {
        const url = token.replace('[IMAGE]', '').replace('[/IMAGE]', '').trim();
        return (
          <View key={index} className="rounded-xl overflow-hidden my-3 border border-faint">
            <Text className="bg-surface-muted px-3 py-1 text-[10px] text-content-faint font-extrabold uppercase">Image Attachment</Text>
            <Text className="text-xs text-content-muted p-2" numberOfLines={1}>{url}</Text>
          </View>
        );
      }
      if (token.startsWith('[LINK]')) {
        const linkRaw = token.replace('[LINK]', '').replace('[/LINK]', '').trim();
        const parts = linkRaw.split('|');
        const label = parts[0]?.trim() || 'View Link';
        const url = parts[1]?.trim() || '#';
        return (
          <TouchableOpacity key={index} className="my-2 py-1 px-3 border border-subtle bg-surface-muted rounded-lg inline-flex flex-row items-center justify-between">
            <Text className="text-xs font-bold text-primary-500 underline">{label}</Text>
            <Text className="text-[10px] text-content-faint font-semibold">{url}</Text>
          </TouchableOpacity>
        );
      }
      return <Text key={index} className="text-sm text-content-strong leading-relaxed">{token}</Text>;
    });
  };

  // ── Metrics ───────────────────────────────────────────────────────────────
  //
  // Counted over the **composed document** rather than the raw editor text, so
  // the markers themselves are excluded and the figure matches the `wordCount`
  // the server computes from the blocks it is sent. Counting the raw text meant
  // the review step disagreed with the reading time on the member's own card.
  const composedSections = useMemo(
    () =>
      composeGuideDocument(content, {
        sectionTitle: title || 'Guide',
        reuseSectionIds: [documentIds.current.sectionId],
        reuseBlockIds: documentIds.current.blockIds,
      }),
    [content, title]
  );

  const wordCount = documentWordCount(composedSections);

  /**
   * What each step needs before it can be left, in the member's own words.
   *
   * This screen gated more carefully than its siblings already — it knew the
   * server's own title minimum and refused an empty document rather than
   * spending a round trip on `guides.structure.empty`. What it did not do was
   * say any of that: the button simply went grey, on a step where the reason
   * might be a title three characters short.
   *
   * Two lists, because "empty" and "wrong" are different sentences. A title of
   * two characters is filled in; telling the member it is *still needed* would
   * send them looking for a field they can see.
   */
  const requiredByStep: { label: string; filled: boolean }[][] = [
    [{ label: 'Category', filled: !!selectedCategory }],
    [{ label: 'Guide title', filled: !!title.trim() }],
    [{ label: 'Guide content', filled: !!content.trim() }],
    [],
  ];

  const problemsByStep: (string | null)[] = [
    null,
    title.trim().length > 0 && title.trim().length < GUIDE_TITLE_MIN_LENGTH
      ? `A guide title needs at least ${GUIDE_TITLE_MIN_LENGTH} characters.`
      : null,
    null,
    // `guides.structure.empty` is what a publish over an empty document
    // answers. Reaching it is a wasted round trip and an orphan draft.
    !hasPublishableContent(composedSections)
      ? 'This guide has no content to publish yet.'
      : null,
  ];

  const stillNeeded = (requiredByStep[currentStep] ?? [])
    .filter((field) => !field.filled)
    .map((field) => field.label);

  const stepProblem = problemsByStep[currentStep] ?? null;
  // `GuideLimits.WordsPerMinute`, so this estimate and the server's agree.
  const readTimeMin = Math.max(Math.ceil(wordCount / GUIDE_WORDS_PER_MINUTE), 1);

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  const selectedCountryOption = countryOptions.find(
    (option) => option.countryCode === selectedCountry
  );

  const handlePublish = () => {
    if (publish.isPending) return;

    // 1. Fraud protection - cover image reuse checks
    if (coverImage) {
      const fraudCheck = TrustEngine.detectImageReuse(coverImage);
      if (fraudCheck.fraudTriggered) {
        showAlert({ type: 'info', title: 'Security Exception Triggered', message: 'Spam detection flagged duplicate cover photo uploads. Please choose a unique community photo to publish.', buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Guidelines', onPress: () => router.push('/profile/community-guidelines') }
          ] });
        return;
      }
    }

    // 2. The refusals the server would make, made here first.
    //
    // Each of these would otherwise arrive as a 400 *after* `POST /guides` had
    // already created a draft — a member would be told their guide failed while
    // an orphan draft sat in their workspace.
    if (!selectedCountry || !selectedCategory) {
      showAlert({
        type: 'error',
        title: 'Not ready to publish',
        message: 'Choose a country and a category before publishing.',
      });
      return;
    }

    if (title.trim().length < GUIDE_TITLE_MIN_LENGTH) {
      showAlert({
        type: 'error',
        title: 'Title too short',
        message: `A guide title needs at least ${GUIDE_TITLE_MIN_LENGTH} characters.`,
      });
      return;
    }

    if (!hasPublishableContent(composedSections)) {
      // `PublishGuideCommandHandler` refuses this with `guides.structure.empty`.
      showAlert({
        type: 'error',
        title: 'Nothing to publish',
        message: 'A guide needs some content before it can be published.',
      });
      return;
    }

    if (exceedsBlockLimit(composedSections)) {
      showAlert({
        type: 'error',
        title: 'A section is too long',
        message: 'One part of your guide is longer than the platform accepts. Split it up and try again.',
      });
      return;
    }

    // Remember the identifiers this attempt used, so a retry after a failure
    // sends the same section id rather than looking like a different document.
    documentIds.current = {
      sectionId: composedSections[0].sectionId,
      blockIds: composedSections[0].blocks.map((block) => block.blockId),
    };

    // 3. The four calls. `publishNewGuide` awaits each before starting the next,
    //    and the success handler below runs **only** when the last one returned.
    publish.mutate(
      {
        create: {
          title: title.trim(),
          categoryKey: selectedCategory,
          // The client is English-only today. When a language picker exists this
          // is where it feeds; the server takes lower-case ISO 639-1.
          language: 'en',
          countryCode: selectedCountry,
          summary: summary.trim() || null,
        },
        sections: composedSections,
        heroMediaId: coverImage,
        revisionNotes: 'First publication.',
      },
      {
        onSuccess: ({ guide, warnings }) => {
          // The draft is cleared **here**, and nowhere else. It used to be
          // cleared before anything was attempted, so a member whose publish
          // failed lost the text as well as the guide.
          globalGuideDraft = null;

          // The local trust record now describes something that happened.
          trustStore.addAuditLog(
            'Guide Published',
            `Published guide "${guide.title}" (${guide.guideId}, version ${guide.currentVersion})`
          );

          useTrustStore.setState((state) => {
            const hasPublishedFirstGuide = state.trustJourney.some(
              (j) => j.type === 'PublishFirstGuide'
            );
            if (hasPublishedFirstGuide) return { trustJourney: state.trustJourney };

            return {
              trustJourney: [
                ...state.trustJourney,
                {
                  eventId: `je-firstguide-${guide.guideId}`,
                  type: 'PublishFirstGuide' as const,
                  label: 'Published First Guide',
                  timestamp: new Date().toISOString().split('T')[0],
                  icon: '📖',
                  description: `Wrote and published first blueprint: "${guide.title}"`,
                },
              ],
            };
          });

          // The optional steps that did not land. The guide is published either
          // way — refusing to publish over a photograph would throw away a
          // finished guide — but the member is told what is missing so they can
          // repair it from the editor rather than discovering it on their card.
          const lostHero = warnings.some((warning) => warning.step === 'media');

          showAlert({
            type: 'success',
            title: 'Guide Published',
            message: lostHero
              ? `"${guide.title}" is live. Your cover photo did not attach — you can add it from the guide.`
              : `"${guide.title}" is live and readers can find it now.`,
            buttons: [
              {
                text: 'Read it',
                onPress: () => router.replace(`/guide/${guide.guideId}`),
              },
              {
                text: 'Return',
                style: 'cancel',
                onPress: () => router.replace('/(tabs)/knowledge/guides'),
              },
            ],
          });
        },
        onError: (error) => {
          // **Nothing here claims success.** The failing step decides the words,
          // because "we could not start your guide" and "your draft is saved but
          // it is not live" need different actions from the member.
          const step = error instanceof GuidePublishError ? error.step : null;
          const cause = error instanceof GuidePublishError ? error.cause : error;
          const guideId = error instanceof GuidePublishError ? error.guideId : null;
          const detail = guideErrorMessage(cause);

          if (step === 'create' || !guideId) {
            showAlert({
              type: 'error',
              title: 'Guide not created',
              message: `${detail} Your text is still here — try again when you are ready.`,
            });
            return;
          }

          showAlert({
            type: 'error',
            title: step === 'content' ? 'Content not saved' : 'Not published yet',
            message:
              step === 'content'
                ? `${detail} Your guide was created but its content did not save. It is in your drafts.`
                : `${detail} Your guide is saved as a draft and is not visible to readers yet.`,
            buttons: [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Open the draft',
                onPress: () => router.replace(`/guide/${guideId}`),
              },
            ],
          });
        },
      }
    );
  };

  if (mayPublish === false) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="Write a guide" />
        <ScrollView className="flex-1 px-6 pt-6">
          <Text className="text-lg font-black text-content-primary mb-2">Publishing guides is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Publishing a guide needs a verified Diaspora account. Once your account is verified, you
            can write and publish straight away.
          </Text>
          <Button label="Go back to Guides" variant="primary" onPress={() => router.replace('/(tabs)/knowledge/guides')} className="w-full mb-3" />
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} className="w-full" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Explicit Stepper progress bar */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Create Community Guide
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
          <TouchableOpacity onPress={() => router.replace('/(tabs)/knowledge/guides')} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft Recovery banner warning */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-surface-muted border-b border-subtle px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Guide Draft Detected</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Restore your previous guide draft?
              </Text>
            </View>
            <View className="flex-row">
              <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3 py-2 rounded-xl mr-2">
                <Text className="text-xs font-bold text-white">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={discardDraft} className="bg-surface-muted border border-subtle px-3 py-2 rounded-xl">
                <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
          
          {/* Step 2: Category Selector */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the best category so community members can locate your guide under the Knowledge Hub filters.
              </Text>

              {categoriesLoading ? (
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Loading guide categories"
                  className="py-6 items-center"
                >
                  <ActivityIndicator color="#F59300" />
                </View>
              ) : categories.length === 0 ? (
                <View className="bg-surface-background border border-subtle rounded-2xl p-4">
                  <Text className="text-xs text-content-muted leading-relaxed font-semibold">
                    We could not load the guide categories. Without one, a guide cannot be filed —
                    check your connection and come back.
                  </Text>
                </View>
              ) : (
                // The shared dropdown with search (14 Oct 2026), the same control
                // every form uses for a category. It sends the **key**, not the
                // name: `CreateGuideRequest` takes `categoryKey` and refuses a
                // display name.
                <SearchableSelect
                  label="Category"
                  placeholder="Choose a category"
                  searchPlaceholder="Search categories"
                  options={categories.map((category) => ({ key: category.key, label: category.name }))}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  testID="guide-category"
                />
              )}
            </View>
          )}

          {/* Step 3: Basics */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide a compelling title and summary. This appears in trending feeds and search lists.
              </Text>

              {/* `maxLength` mirrors `GuideLimits`, so the member cannot type
                  past a ceiling the server would refuse them at the last step. */}
              <Input
                label="Guide Title"
                placeholder="e.g. How to get a Mauritian Work Permit"
                value={title}
                onChangeText={setTitle}
                maxLength={GUIDE_TITLE_MAX_LENGTH}
              />

              <Input
                label="Short Summary"
                placeholder="A quick 1-2 sentence preview of what the guide teaches..."
                value={summary}
                onChangeText={setSummary}
                multiline
                numberOfLines={3}
                maxLength={GUIDE_SUMMARY_MAX_LENGTH}
                className="h-20"
              />

              <ImagePickerInput
                label="Cover Photo"
                value={coverImage}
                onChangeImage={setCoverImage}
              />
            </View>
          )}

          {/* Step 4: Rich Text Editor */}
          {currentStep === 2 && (
            <View className="pb-8">
              {/* AI Assistant panel triggers */}
              <View className="flex-row justify-between mb-4">
                <TouchableOpacity onPress={() => triggerAiAction('outline')} className="bg-surface-muted px-2.5 py-1.5 rounded-lg border border-subtle">
                  <Text className="text-[10px] font-extrabold text-content-tertiary">🪄 AI Outline</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => triggerAiAction('improve')} className="bg-surface-muted px-2.5 py-1.5 rounded-lg border border-subtle">
                  <Text className="text-[10px] font-extrabold text-content-tertiary">✨ AI Improve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => triggerAiAction('title')} className="bg-surface-muted px-2.5 py-1.5 rounded-lg border border-subtle">
                  <Text className="text-[10px] font-extrabold text-content-tertiary">💡 AI Titles</Text>
                </TouchableOpacity>
              </View>

              {/* AI Loading State or Suggestions output */}
              {aiLoading && (
                <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-4 flex-row items-center">
                  <ActivityIndicator size="small" color="#F59300" className="mr-3" />
                  <Text className="text-xs text-content-tertiary font-medium">{aiLoadingText}</Text>
                </View>
              )}

              {aiSuggestions && (
                <View className="bg-surface-muted border border-subtle rounded-2xl p-4 mb-4">
                  <Text className="text-xs text-content-secondary leading-relaxed font-semibold">{aiSuggestions}</Text>
                  <TouchableOpacity onPress={() => setAiSuggestions(null)} className="mt-2 align-self-end">
                    <Text className="text-[10px] font-bold text-primary-500 uppercase">Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Formatting Toolbar */}
              <View className="flex-row items-center border border-subtle bg-surface-muted rounded-t-2xl p-2.5 gap-2">
                <TouchableOpacity onPress={() => insertTag('tip')} className="bg-surface-card border border-subtle px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-content-secondary">💡 Tip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('warning')} className="bg-surface-card border border-subtle px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-content-secondary">⚠️ Warn</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('callout')} className="bg-surface-card border border-subtle px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-content-secondary">💬 Notice</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('bullet')} className="bg-surface-card border border-subtle px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-content-secondary">• List</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => insertTag('link')} className="bg-surface-card border border-subtle px-2 py-1 rounded">
                  <Text className="text-[10px] font-extrabold text-content-secondary">🔗 Link</Text>
                </TouchableOpacity>
              </View>

              {/* Guide Editor Input Text Area */}
              <TextInput
                placeholder="Write your long-form community guide. Use the toolbar above to structure callouts, tips, links and formatting..."
                value={content}
                onChangeText={setContent}
                multiline
                className="bg-surface-card border-x border-b border-subtle rounded-b-2xl p-4 min-h-[160px] text-sm leading-relaxed text-content-strong"
                placeholderTextColor={tokens.color.text.placeholder}
                textAlignVertical="top"
              />

              {/* Live Rich Render Preview */}
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-6 mb-3">Live Rich Editor Preview</Text>
              <View className="bg-surface-background rounded-2xl p-4 border border-subtle min-h-[100px]">
                {parseRichPreview(content)}
              </View>
            </View>
          )}

          {/* Step 5: Review & Preview */}
          {currentStep === 3 && (
            <View className="pb-8">
              {/* QA Review stats */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-6">
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Estimated Metrics & QA checks</Text>
                
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-content-tertiary font-semibold">Word Count:</Text>
                  <Text className="text-xs font-bold text-content-strong">{wordCount} words</Text>
                </View>
                <View className="flex-row justify-between mb-3 border-b border-faint pb-2">
                  <Text className="text-xs text-content-tertiary font-semibold">Estimated Read Time:</Text>
                  <Text className="text-xs font-bold text-primary-500">{readTimeMin} min read</Text>
                </View>

                {/* What the guide will actually be made of.
                    The two "AI Review" rows that used to sit here printed
                    "PASSED" and "EXCELLENT" unconditionally — over an empty
                    guide as readily as a finished one. Nothing computed them and
                    nothing on the server had an opinion about either, so they
                    are replaced by the two facts the platform really holds. */}
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-content-tertiary font-semibold">Sections:</Text>
                  <Text className="text-xs font-bold text-content-strong">
                    {composedSections.length}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-content-tertiary font-semibold">Content blocks:</Text>
                  <Text className="text-xs font-bold text-content-strong">
                    {composedSections.reduce((total, s) => total + s.blocks.length, 0)}
                  </Text>
                </View>
              </View>

              {/* Published Article View representation */}
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Article Layout Representation</Text>
              <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
                <Text className="text-xs font-extrabold text-primary-500 uppercase tracking-wider mb-2">
                  {categories.find((category) => category.key === selectedCategory)?.name ??
                    selectedCategory ??
                    'UNFILED'}{' '}
                  · {selectedCountryOption?.countryName ?? selectedCountry ?? 'NO COUNTRY'}
                </Text>
                <Text className="text-xl font-bold text-content-primary mb-2 leading-snug">{title || 'Guide Title'}</Text>
                <Text className="text-sm font-semibold text-content-muted mb-4 leading-relaxed">{summary || 'Guide summary placeholder...'}</Text>
                
                <View className="border-t border-faint pt-4">
                  {parseRichPreview(content)}
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Back is held mid-publish: going back would let the member edit a
            guide five calls into being created. */}
        <WizardFooter
          onBack={currentStep > 0 ? () => setCurrentStep(currentStep - 1) : undefined}
          backDisabled={publish.isPending}
          onNext={() => {
            if (currentStep < steps.length - 1) {
              setCurrentStep(currentStep + 1);
            } else {
              handlePublish();
            }
          }}
          nextLabel={currentStep === steps.length - 1 ? 'Publish' : 'Next'}
          stillNeeded={stillNeeded}
          problem={stepProblem}
          isLoading={publish.isPending}
          loadingLabel="Publishing…"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
