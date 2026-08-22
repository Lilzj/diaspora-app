// ─────────────────────────────────────────────────────────────────────────────
// Saved
//
// ── What this screen used to do ─────────────────────────────────────────────
//
//     const savedItems = mockFavourites;
//
// Every member on the platform opened "Saved" and saw the same fabricated list
// of businesses, presented as things *they* had saved. The heart controls that
// were supposed to fill it were `useState` toggles that forgot themselves on
// unmount, so nothing a member actually saved ever appeared here, and nothing
// here had ever been saved by anybody.
//
// ── What it does now ────────────────────────────────────────────────────────
//
//     GET /community/bookmarks/collections   → BookmarkCollectionResponse[]
//
// via the existing certified `useBookmarkCollections()`. This is the right
// surface and not an approximation: `ProviderBookmarkService` in the backend is
// explicit that the Providers module "publishes the bookmark endpoints and owns
// none of the storage" — `PUT /providers/{id}/bookmark` writes a
// `ContentReference(Listing, providerId)` into **Community's** bookmarks. So the
// provider a member saves from `provider/[id].tsx` lands in exactly the
// collection this screen reads.
//
// ── Why the rows are references and not cards ───────────────────────────────
//
// `BookmarkResponse` carries `contentType`, `contentId`, `folderId`, `note` and
// `createdAt` — and no title, no image, no rating. There is no route that
// expands a page of bookmarks into a page of content. Rendering a `ProviderCard`
// here would mean either fabricating the title and rating again, or issuing one
// request per saved item on mount.
//
// So each saved item is shown as what the server actually knows about it — its
// kind, when it was saved, the member's own note — and opens the real thing on
// tap. That is less pretty than the fixture was. It is also true.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { router } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useBookmarkCollections } from '@/hooks/community-social';
import type { CommunityContentType } from '@/types/community-social';

interface SavedKind {
  label: string;
  glyph: string;
  route: (id: string) => string;
}

/**
 * How each saved kind is labelled and where it opens.
 *
 * Keyed by the wire value, which `CommunityContentType` documents as **lower
 * case** — the naming converter camel-cases `contentType` on every response, and
 * only `capabilities.reactions[].appliesTo[]` escapes it. A map keyed on
 * `'Listing'` would match nothing and every saved item would fall through to the
 * unrecognised branch.
 *
 * Both `listing` and `provider` point at the provider profile:
 * `ProviderBookmarkService.ReferenceFor` writes `CommunityContentType.Listing`
 * for a saved provider — the backend reserved that member with the comment "A
 * service provider listing" before the Providers module existed — while
 * `provider` is the newer name on the same union. Handling one and not the other
 * would drop half the saved providers depending on when they were saved.
 *
 * A plain string key rather than `Record<CommunityContentType, …>` because that
 * type is open (`TKnown | (string & {})`), so a keyed record over it would
 * demand an entry for every string.
 */
const SAVED_KINDS: Record<string, SavedKind> = {
  listing: { label: 'Service provider', glyph: '🏬', route: (id) => `/provider/${id}` },
  provider: { label: 'Service provider', glyph: '🏬', route: (id) => `/provider/${id}` },
  guide: { label: 'Guide', glyph: '📘', route: (id) => `/guide/${id}` },
  job: { label: 'Job', glyph: '💼', route: (id) => `/job/${id}` },
  event: { label: 'Event', glyph: '📅', route: (id) => `/community-life/event/${id}` },
  organization: { label: 'Organisation', glyph: '🏛️', route: (id) => `/community-life/org/${id}` },
};

interface SavedRow {
  key: string;
  contentType: CommunityContentType;
  contentId: string;
  folderName: string;
  note: string | null;
  createdAt: string;
}

export default function SavedScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { collections, isLoading, error, refresh } = useBookmarkCollections();

  // Flattened across folders. There is no route that moves a bookmark between
  // folders, so the folder is shown as a label rather than as navigation.
  const rows = useMemo<SavedRow[]>(
    () =>
      collections.flatMap((collection) =>
        collection.items.map((item) => ({
          key: item.bookmarkId,
          contentType: item.contentType,
          contentId: item.contentId,
          folderName: collection.name,
          note: item.note,
          createdAt: item.createdAt,
        }))
      ),
    [collections]
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background">
        <View className="px-6 pt-4 pb-3">
          <Text className="text-3xl font-bold text-content-primary">Saved</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-sm text-content-muted mt-4">Loading what you have saved…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background">
        <View className="px-6 pt-4 pb-3">
          <Text className="text-3xl font-bold text-content-primary">Saved</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">⚠️</Text>
          <Text className="text-lg font-bold text-content-strong text-center">
            Could not load your saved items
          </Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            Nothing has been unsaved — we could not reach Diaspora to read the list.
          </Text>
          <Button label="Try again" variant="outline" className="mt-6" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <View className="px-6 pt-4 pb-3">
        <Text className="text-3xl font-bold text-content-primary">Saved</Text>
      </View>

      {rows.length === 0 ? (
        <EmptyState
          icon="🔖"
          title="Nothing saved yet"
          description="Tap the heart on any provider, guide, job or home to save it for later."
          action={
            <Button
              label="Explore Providers"
              variant="primary"
              size="sm"
              onPress={() => router.push('/(tabs)/search')}
            />
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          refreshing={false}
          onRefresh={refresh}
          renderItem={({ item }) => {
            // An unrecognised content type is rendered as itself rather than
            // guessed at. A new backend type must not silently become "Guide".
            const kind = SAVED_KINDS[item.contentType];

            return (
              <TouchableOpacity
                activeOpacity={kind ? 0.7 : 1}
                disabled={!kind}
                onPress={() => kind && router.push(kind.route(item.contentId))}
                className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 mb-3 flex-row items-center"
              >
                <Text className="text-2xl mr-3">{kind?.glyph ?? '🔖'}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-content-primary">
                    {kind?.label ?? item.contentType}
                  </Text>
                  {item.note ? (
                    <Text className="text-xs text-content-muted mt-0.5">{item.note}</Text>
                  ) : null}
                  <Text className="text-[10px] text-content-faint mt-1">
                    {item.folderName} · saved{' '}
                    {new Date(item.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                {kind ? <Text className="text-content-faint text-lg">›</Text> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
