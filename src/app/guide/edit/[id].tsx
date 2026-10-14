// ─────────────────────────────────────────────────────────────────────────────
// Edit a guide — the author's own (14 Oct 2026)
//
// Until now a guide could be written once and never corrected: the reader had a
// Remove button for its author and nothing else, and `updateGuide` was called
// only by the create wizard.
//
// Editable: the title, the summary, the words of every text block and every
// section title (blocks can be added, and a block emptied is dropped), the
// category, the tags and the cover photo. `saveGuideEdits` sends each to the
// route that owns it and threads the revision through — see `guides-api.ts`.
//
// Kept as they are, shown but not editable: image, video, table, link and
// attachment blocks. Each carries a media reference or an opaque JSON payload
// that the editor owns and this form cannot rebuild; they go back to the server
// byte for byte, in place.
//
// A published guide stays published: readers see the change on save. It is not
// re-published, because a second publication is scored by Trust as a new guide.
//
// Ownership is the signed-in user's id against `guide.authorId` — the same test
// the reader uses, and correct here because a guide's author id is a user id.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { useGuide, useGuideCategories } from '@/hooks/guides';
import { useMediaAsset } from '@/hooks/media';
import {
  GUIDE_MAX_TAGS,
  GUIDE_SUMMARY_MAX_LENGTH,
  GUIDE_TITLE_MAX_LENGTH,
  GUIDE_TITLE_MIN_LENGTH,
  GuideEditError,
  guideErrorMessage,
  hasPublishableContent,
  saveGuideEdits,
  sectionsAsInput,
  type GuideEditStep,
} from '@/lib/guides-api';
import { exceedsBlockLimit, newDocumentId } from '@/lib/guide-composer';
import { backOr } from '@/lib/navigation';
import { useNotification } from '@/providers/notification-provider';
import { useAuthStore } from '@/store/auth';
import type { GuideBlockKind, GuideResponse, GuideSectionInput } from '@/types/guides';

/** The block kinds whose whole meaning is their text, and so can be edited here. */
const TEXT_KINDS: Partial<Record<GuideBlockKind, string>> = {
  Markdown: 'Paragraph',
  RichText: 'Paragraph',
  Callout: 'Callout',
  Warning: 'Warning',
  Tip: 'Tip',
  CodeSnippet: 'Code',
};

const STEP_NAMES: Record<GuideEditStep, string> = {
  content: 'the title, summary and content',
  category: 'the category',
  tags: 'the tags',
  cover: 'the cover photo',
};

function heroOf(guide: GuideResponse): string | null {
  return guide.mediaReferences.find((reference) => reference.role === 'Hero')?.mediaId ?? null;
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** The slug the server will store, so "Work permit" against `work-permit` is not a change. */
function tagKey(tags: string[]): string {
  return tags.map((tag) => tag.toLowerCase().replace(/\s+/g, '-')).join(',');
}

/**
 * The document as it will be sent: emptied text blocks dropped, orders renumbered.
 *
 * Non-text blocks are never dropped — an image block has no text and is not empty.
 */
function normalise(sections: GuideSectionInput[]): GuideSectionInput[] {
  return sections.map((section, sectionIndex) => ({
    ...section,
    title: section.title.trim(),
    order: sectionIndex + 1,
    blocks: section.blocks
      .filter((block) => !(block.kind in TEXT_KINDS) || (block.content ?? '').trim().length > 0)
      .map((block, blockIndex) => ({ ...block, order: blockIndex + 1 })),
  }));
}

export default function EditGuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const guideId = typeof id === 'string' && id.length > 0 ? id : null;
  const back = () => backOr(guideId ? `/guide/${guideId}` : '/(tabs)');

  const viewerId = useAuthStore((state) => state.user?.userId ?? null);
  const { guide: loaded, isLoading, error } = useGuide(guideId);
  const { categories, selectable, isLoading: categoriesLoading } = useGuideCategories();
  const queryClient = useQueryClient();
  const { showToast, showAlert } = useNotification();

  // The server's guide this form is measured against. Replaced after a save
  // that partly landed, so the steps that succeeded are not sent twice and the
  // next attempt carries the revision the server now holds.
  const [base, setBase] = useState<GuideResponse | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [sections, setSections] = useState<GuideSectionInput[]>([]);
  const [heroMediaId, setHeroMediaId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const adopt = (guide: GuideResponse) => {
    setBase(guide);
    setTitle(guide.title);
    setSummary(guide.summary ?? '');
    setCategoryKey(guide.categoryKey);
    setTagsText(guide.tags.join(', '));
    setSections(sectionsAsInput(guide));
    setHeroMediaId(heroOf(guide));
  };

  // Prefill once. A background refetch must not overwrite what the author is typing.
  useEffect(() => {
    if (loaded && !base) adopt(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, base]);

  const baseHero = base ? heroOf(base) : null;
  const currentCover = useMediaAsset(heroMediaId && heroMediaId === baseHero ? baseHero : null);

  // An inactive category is closed to *new* guides; one already filed there keeps it.
  const categoryOptions = useMemo(() => {
    const own = categories.find((category) => category.key === base?.categoryKey);
    return own && !own.isActive ? [own, ...selectable] : selectable;
  }, [categories, selectable, base?.categoryKey]);

  const tags = parseTags(tagsText);
  const sendable = normalise(sections);

  const sectionsChanged =
    base !== null && JSON.stringify(sendable) !== JSON.stringify(normalise(sectionsAsInput(base)));
  const changed =
    base !== null &&
    (title.trim() !== base.title ||
      summary.trim() !== (base.summary ?? '') ||
      categoryKey !== base.categoryKey ||
      tagKey(tags) !== tagKey(base.tags) ||
      heroMediaId !== baseHero ||
      sectionsChanged);

  // The first thing missing, named, so the member knows why Save is greyed out.
  const missing = (() => {
    if (title.trim().length < GUIDE_TITLE_MIN_LENGTH) {
      return `Title: at least ${GUIDE_TITLE_MIN_LENGTH} characters.`;
    }
    if (!categoryKey) return 'Category: choose one.';
    if (tags.length > GUIDE_MAX_TAGS) return `Tags: at most ${GUIDE_MAX_TAGS}.`;
    if (sendable.some((section) => section.title.length === 0)) return 'Content: every section needs a title.';
    if (!hasPublishableContent(sendable)) return 'Content: the guide needs some text.';
    if (exceedsBlockLimit(sendable)) return 'Content: one block is longer than a guide allows.';
    return null;
  })();

  const canSave = changed && !missing && !isSaving;

  const updateSection = (sectionId: string, change: (section: GuideSectionInput) => GuideSectionInput) =>
    setSections((current) => current.map((section) => (section.sectionId === sectionId ? change(section) : section)));

  const save = async () => {
    if (!base || !canSave) return;
    setIsSaving(true);
    try {
      await saveGuideEdits(base, {
        title: title.trim(),
        summary: summary.trim().length > 0 ? summary.trim() : null,
        sections: sectionsChanged ? sendable : undefined,
        categoryKey,
        tags,
        heroMediaId,
      });
      void queryClient.invalidateQueries();
      showToast({ type: 'success', title: 'Guide saved', message: 'Your changes are live.' });
      back();
    } catch (cause) {
      void queryClient.invalidateQueries();
      if (cause instanceof GuideEditError) {
        // Whatever landed before the failure is now the baseline; the member's
        // unsaved edits stay in the form.
        setBase(cause.guide);
        showAlert({
          type: 'error',
          title: 'Not everything was saved',
          message: `We could not save ${STEP_NAMES[cause.step]}. ${guideErrorMessage(cause.cause)}`,
        });
      } else {
        showAlert({ type: 'error', title: 'Could not save your guide', message: guideErrorMessage(cause) });
      }
    } finally {
      setIsSaving(false);
    }
  };

  let content: React.ReactNode;

  if (isLoading || (loaded && !base)) {
    content = (
      <View className="p-4">
        <Skeleton height={48} className="mb-4" />
        <Skeleton height={160} />
      </View>
    );
  } else if (!loaded || !base) {
    content = (
      <EmptyState icon="⚠️" title="This guide is not available" description={error ?? 'It may have been removed.'} />
    );
  } else if (!viewerId || base.authorId !== viewerId) {
    content = (
      <EmptyState
        icon="🔒"
        title="You can only edit your own guides"
        description="This guide was written by somebody else."
      />
    );
  } else if (base.status === 'Archived') {
    // `EnsureEditable` refuses every write to an archived guide, so a form here
    // would only collect changes to be refused.
    content = (
      <EmptyState
        icon="🗄️"
        title="This guide is archived"
        description="An archived guide must be restored before it can be edited."
      />
    );
  } else {
    content = (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Input label="Title" value={title} onChangeText={setTitle} maxLength={GUIDE_TITLE_MAX_LENGTH} />
        <Input
          label="Summary (optional)"
          value={summary}
          onChangeText={setSummary}
          multiline
          numberOfLines={3}
          maxLength={GUIDE_SUMMARY_MAX_LENGTH}
          className="h-20"
          textAlignVertical="top"
        />

        {/* The shared dropdown with search (14 Oct 2026); it was a chip wall. */}
        <SearchableSelect
          label="Category"
          placeholder="Choose a category"
          searchPlaceholder="Search categories"
          options={categoryOptions.map((category) => ({ key: category.key, label: category.name }))}
          value={categoryKey || null}
          onChange={setCategoryKey}
          isLoading={categoriesLoading}
          testID="guide-edit-category"
        />

        <Input
          label={`Tags (comma separated, up to ${GUIDE_MAX_TAGS})`}
          placeholder="e.g. work permit, visas"
          value={tagsText}
          onChangeText={setTagsText}
          autoCapitalize="none"
        />

        <Text className="mb-2 text-sm font-medium text-content-muted">Cover photo</Text>
        {heroMediaId && heroMediaId === baseHero ? (
          <View className="mb-4">
            {currentCover.url ? (
              <Image
                source={{ uri: currentCover.url }}
                style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
                contentFit="cover"
                accessibilityLabel="Current cover photo"
              />
            ) : (
              <Text className="text-xs text-content-faint">The current cover photo is kept.</Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setHeroMediaId(null)}
              className="py-2"
            >
              <Text className="text-sm font-bold text-error-default">Remove cover photo</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <ImagePickerInput
          label={baseHero ? 'Replace cover photo' : 'Add a cover photo'}
          hideLabel
          value={heroMediaId !== baseHero ? heroMediaId : null}
          // Cleared, the picker falls back to whatever the guide had — removing
          // the cover is the explicit button above, not an accident of clearing.
          onChangeImage={(mediaId) => setHeroMediaId(mediaId ?? baseHero)}
        />

        <Text className="mt-2 mb-2 text-base font-bold text-content-strong">Content</Text>
        {sections.map((section, sectionIndex) => (
          <View key={section.sectionId} className="mb-6 p-3 rounded-xl border border-subtle bg-surface-card">
            <Input
              label={`Section ${sectionIndex + 1} title`}
              value={section.title}
              onChangeText={(text) => updateSection(section.sectionId, (s) => ({ ...s, title: text }))}
            />
            {section.blocks.map((block) => {
              const label = TEXT_KINDS[block.kind];
              if (!label) {
                return (
                  <Text key={block.blockId} className="text-xs text-content-faint mb-4">
                    {block.kind} block — kept as it is.
                  </Text>
                );
              }
              return (
                <Input
                  key={block.blockId}
                  label={label}
                  value={block.content ?? ''}
                  onChangeText={(text) =>
                    updateSection(section.sectionId, (s) => ({
                      ...s,
                      blocks: s.blocks.map((b) => (b.blockId === block.blockId ? { ...b, content: text } : b)),
                    }))
                  }
                  multiline
                  textAlignVertical="top"
                  className="min-h-24"
                />
              );
            })}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                updateSection(section.sectionId, (s) => ({
                  ...s,
                  blocks: [
                    ...s.blocks,
                    {
                      blockId: newDocumentId(),
                      kind: 'Markdown',
                      order: s.blocks.length + 1,
                      content: '',
                      mediaId: null,
                      metadata: null,
                    },
                  ],
                }))
              }
              className="py-2"
            >
              <Text className="text-sm font-bold text-primary-500">+ Add a paragraph</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Text className="text-xs text-content-faint mb-4">
          Empty a paragraph to remove it. Pictures, tables and links are kept as they are.
          {base.status === 'Published' ? ' Your changes are visible to readers as soon as you save.' : ''}
        </Text>

        {missing ? <Text className="text-sm text-error-default mb-2">{missing}</Text> : null}
        <Button
          label="Save changes"
          onPress={() => void save()}
          disabled={!canSave}
          isLoading={isSaving}
          loadingLabel="Saving…"
        />
        {!changed && !isSaving ? (
          <Text className="text-xs text-content-faint mt-2 text-center">No changes yet.</Text>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit guide" showBack onBack={back} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
