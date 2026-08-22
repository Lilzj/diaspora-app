import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { exportMyData, type PersonalDataExport } from '@/lib/privacy-api';

/**
 * Download My Data.
 *
 * ── Why this shows a summary before it shows the data ────────────────────────
 *
 * An export is a wall of JSON. Dropping it on somebody unannounced tells them
 * nothing about whether it is complete, which is the only question they actually
 * have. So the screen leads with what was found, module by module, and hands over
 * the document on a deliberate second tap.
 *
 * ── Why the gaps are on screen ───────────────────────────────────────────────
 *
 * `modulesWithoutExportProvider` is the server saying "these modules hold data and
 * could not contribute". Twenty-one of twenty-two modules are in that list today.
 * Hiding it would let this screen read as "here is everything Diaspora holds about
 * you", which would be false — so it is rendered, in plain words, above the fold.
 *
 * ── Why sharing rather than saving ───────────────────────────────────────────
 *
 * `expo-file-system` is not a dependency of this project, so there is nowhere to
 * write a file to. `Share.share` hands the document to whatever the member already
 * uses — mail, notes, a cloud drive — and keeps the platform out of the business of
 * hosting a document full of somebody's private messages at a URL. If a real file
 * is wanted later, that is a native dependency and a rebuild, not a redesign.
 */
export default function DataExportScreen() {
  const bottomInset = useBottomInset();

  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [data, setData] = useState<PersonalDataExport | null>(null);
  const [shared, setShared] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setData(await exportMyData());
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onShare = useCallback(async () => {
    if (!data) return;

    await Share.share({
      title: 'My Diaspora data',
      message: JSON.stringify(data, null, 2),
    });

    setShared(true);
  }, [data]);

  const totalRecords =
    data?.sections.reduce((sum, section) => sum + section.records.length, 0) ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="Download My Data" />
      <ScrollEndScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        {state === 'loading' && (
          <View className="items-center py-12">
            <ActivityIndicator />
            <Text className="text-content-muted mt-3">Gathering your data…</Text>
          </View>
        )}

        {state === 'failed' && (
          <View className="bg-surface-card rounded-xl p-4">
            <Text className="text-content-primary font-medium mb-1">
              We could not gather your data just now
            </Text>
            <Text className="text-content-muted text-sm mb-3">
              Nothing was changed. Try again in a moment.
            </Text>
            <Pressable
              onPress={load}
              accessibilityRole="button"
              className="bg-primary-500 rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold">Try again</Text>
            </Pressable>
          </View>
        )}

        {state === 'ready' && data && (
          <>
            <View className="bg-surface-card rounded-xl p-4 mb-4">
              <Text className="text-content-primary font-semibold mb-1">
                {totalRecords} record{totalRecords === 1 ? '' : 's'} across{' '}
                {data.sections.length} section{data.sections.length === 1 ? '' : 's'}
              </Text>
              <Text className="text-content-muted text-sm">
                This is what you gave Diaspora — not what Diaspora worked out about you.
              </Text>
            </View>

            {data.sections.map((section) => (
              <View
                key={`${section.module}-${section.dataSet}`}
                className="bg-surface-card rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-content-primary font-medium">{section.dataSet}</Text>
                  <Text className="text-content-faint text-xs mt-0.5">{section.module}</Text>
                </View>
                <Text className="text-content-muted">{section.records.length}</Text>
              </View>
            ))}

            {data.modulesWithoutExportProvider.length > 0 && (
              <View className="bg-surface-card rounded-xl p-4 mt-4">
                <Text className="text-content-primary font-medium mb-1">
                  What this export does not cover
                </Text>
                <Text className="text-content-muted text-sm leading-5">
                  {data.modulesWithoutExportProvider.length} part
                  {data.modulesWithoutExportProvider.length === 1 ? '' : 's'} of Diaspora cannot
                  contribute to an export yet, so anything you have there is not in this file.
                </Text>
                <Text className="text-content-faint text-xs mt-2 leading-5">
                  {data.modulesWithoutExportProvider.join(' · ')}
                </Text>
              </View>
            )}

            <Pressable
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share your data export"
              className="bg-primary-500 rounded-xl py-4 items-center mt-6"
            >
              <Text className="text-white font-semibold">Share my data</Text>
            </Pressable>

            {shared && (
              <Text className="text-content-faint text-xs text-center mt-3">
                Shared. Diaspora did not keep a copy of where it went.
              </Text>
            )}

            <Text className="text-content-faint text-xs text-center mt-4 leading-5">
              Generated {new Date(data.generatedAt).toLocaleString()}. An export is a snapshot —
              anything you do after this moment is not in it.
            </Text>
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
