// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-3 — a guide's publication history, from the server.
//
// This screen read `mockGuideVersions` and resolved each version's editor
// through the `mockAuthors` map, falling back to "Unknown". Every guide on the
// platform therefore had the same history, and a guide with no fixture entry
// had none.
//
// `GET /guides/{id}/versions` is **anonymous**, and that is the point of it: "a
// reader who acted on a fee, a deadline or a document list should be able to see
// that it changed and when — and a version history visible only to its author is
// a record kept by the one person it could exonerate."
//
// ── The two shape facts worth knowing ───────────────────────────────────────
//
// **A bare array with no cursor**, capped by the server at
// `GuideLimits.MaxVersionsListed` (50). A guide with more than fifty published
// versions shows its newest fifty and the contract offers no way to reach the
// rest.
//
// **`changeSummary` does not exist.** The fixture had a `string[]` of bullet
// points; `GuideVersionSummaryResponse` has `revisionNotes`, a single optional
// string that the editor wrote. There is no per-change list on this contract,
// and rendering one would be inventing it. What the contract *does* offer
// instead is a **diff** — `GET /guides/{id}/versions/compare` — which reports
// which sections changed between two versions, and the "Compare" control below
// opens it.
//
// **The editor is an identifier.** No name, no avatar; there is no author route
// in this module. "Unknown" was the fixture's answer for a missing map entry and
// would have been the answer for every real version.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';

import { useBottomInset } from '@/components/layout/bottom-inset';
import { useGuide, useGuideVersionDiff, useGuideVersions } from '@/hooks/guides';
import { backOr } from '@/lib/navigation';

export default function GuideVersionsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const { guide, isLoading: guideLoading } = useGuide(id);
  const versions = useGuideVersions(id);

  /** The older half of a comparison. The newer half is always the one above it. */
  const [comparing, setComparing] = useState<{ from: number; to: number } | null>(null);

  const diff = useGuideVersionDiff(id, comparing?.from ?? null, comparing?.to ?? null);

  if (guideLoading || versions.isLoading) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 bg-surface-background items-center justify-center"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading version history"
      >
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-4" accessibilityRole="button" accessibilityLabel="Go back">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-content-primary" numberOfLines={1}>
            {guide?.title ?? 'Guide'}
          </Text>
          <Text className="text-sm text-content-muted">Version History</Text>
        </View>
      </View>

      <ScrollEndScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {versions.versions.length === 0 ? (
          <View className="bg-surface-card rounded-xl p-6 border border-subtle items-center">
            <Text className="text-3xl mb-2">🕘</Text>
            <Text className="text-sm font-bold text-content-strong text-center">
              No published versions
            </Text>
            <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[260px]">
              {versions.error ??
                'A version is minted each time this guide is published. This one has not been published yet.'}
            </Text>
          </View>
        ) : (
          versions.versions.map((version, index) => {
            const isLatest = index === 0;
            const older = versions.versions[index + 1];
            const date = new Date(version.publishedAt).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            const isComparing =
              comparing?.to === version.versionNumber && comparing?.from === older?.versionNumber;

            return (
              <View
                key={version.versionId}
                className="bg-surface-card rounded-xl p-4 mb-4 border border-subtle"
              >
                <View className="flex-row justify-between items-center mb-3">
                  <View className="flex-row items-center">
                    <Text className="text-base font-bold text-content-primary mr-2">
                      Version {version.versionNumber}
                    </Text>
                    {isLatest && (
                      <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                        <Text className="text-xs font-semibold text-primary-700">Current</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-content-muted">{date}</Text>
                </View>

                <Text className="text-sm font-semibold text-content-secondary mb-1">
                  {version.title}
                </Text>
                <Text className="text-xs text-content-faint mb-3">
                  {version.wordCount} words · {version.readingTimeMinutes} min read
                </Text>

                {version.revisionNotes ? (
                  <View className="bg-surface-background p-3 rounded-lg">
                    <Text className="text-xs font-semibold text-content-secondary mb-1.5">
                      What the editor said changed:
                    </Text>
                    <Text className="text-sm text-content-tertiary">{version.revisionNotes}</Text>
                  </View>
                ) : (
                  <Text className="text-sm text-content-faint italic">
                    No revision notes were left for this version.
                  </Text>
                )}

                {/* The diff is the contract's answer to "what actually changed",
                    and it is only meaningful against the version before it. */}
                {older ? (
                  <TouchableOpacity
                    onPress={() =>
                      setComparing(
                        isComparing
                          ? null
                          : { from: older.versionNumber, to: version.versionNumber }
                      )
                    }
                    accessibilityRole="button"
                    className="mt-3 self-start"
                  >
                    <Text className="text-xs font-black text-primary-500 uppercase">
                      {isComparing
                        ? 'Hide changes'
                        : `Compare with v${older.versionNumber}`}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {isComparing ? (
                  <View className="mt-3 border-t border-faint pt-3">
                    {diff.isLoading ? (
                      <ActivityIndicator color="#F59300" />
                    ) : diff.diff && diff.diff.sections.length > 0 ? (
                      diff.diff.sections.map((section) => (
                        <View key={section.sectionId} className="flex-row items-start mb-1.5">
                          <Text className="text-xs text-content-faint mr-1.5">•</Text>
                          <Text className="text-sm text-content-tertiary flex-1">
                            <Text className="font-bold">{changeLabel(section.change)}</Text>
                            {' — '}
                            {section.toTitle ?? section.fromTitle ?? 'Untitled section'}
                          </Text>
                        </View>
                      ))
                    ) : (
                      // Unchanged sections are **omitted** from the diff, so an
                      // empty list genuinely means nothing structural changed.
                      <Text className="text-sm text-content-faint italic">
                        {diff.error ?? 'No sections changed between these versions.'}
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

/**
 * `GuideSectionDiffResponse.change` in words.
 *
 * The wire values are **kebab and lower-case** — unlike every enum in this
 * module, because the diff service writes them by hand rather than through
 * `GuideWireNames`. `content-changed` is the literal.
 */
function changeLabel(change: string): string {
  switch (change) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'retitled':
      return 'Retitled';
    case 'content-changed':
      return 'Rewritten';
    default:
      return change;
  }
}
