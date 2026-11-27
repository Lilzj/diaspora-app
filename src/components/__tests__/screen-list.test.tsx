/**
 * An area shell drawing its screen as one long list (FARCH-004, 27 Nov 2026).
 *
 * `CommunityScreen` and `CreatorScreen` drew every screen in one ScrollView, so
 * a screen whose list paged kept every page mounted. Given `list`, a shell
 * draws one FlashList instead. These tests hold it to doing everything the
 * ScrollView did: what the screen draws above its list comes first, the rows
 * and what follows them after it, the list's own empty in place of rows, the
 * shell's loading and error instead of all of it, pull to refresh, and the gap
 * notice above the screen's content.
 */
import React from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { ThemeProvider } from '@/design-system';
import { CommunityScreen } from '../community/CommunityScreen';
import { CreatorScreen } from '../creator-economy/CreatorScreen';
import type { ScreenLoad } from '../layout/screen-groups';
import { FinancialError } from '@/lib/transport/financial-errors';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: '1', name: 'Saturday football' },
  { id: '2', name: 'Monthly clinic' },
];

const renderRow = ({ item }: ListRenderItemInfo<Row>) => <Text>{item.name}</Text>;

type Shell = 'CommunityScreen' | 'CreatorScreen';

function renderShell(
  shell: Shell,
  { rows = ROWS, load = {}, footer }: { rows?: Row[]; load?: ScreenLoad; footer?: React.ReactNode } = {}
) {
  const list = {
    data: rows,
    keyExtractor: (row: Row) => row.id,
    renderItem: renderRow,
    ListEmptyComponent: <Text>Nothing here yet</Text>,
    ListFooterComponent: <Text>Show more</Text>,
  };
  const content = <Text>Filters above the list</Text>;
  const body =
    shell === 'CommunityScreen' ? (
      <CommunityScreen title="Recurring events" load={load} footer={footer} list={list}>
        {content}
      </CommunityScreen>
    ) : (
      <CreatorScreen title="Referrals" load={load} footer={footer} list={list}>
        {content}
      </CreatorScreen>
    );

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{body}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/** The texts in the order they are drawn. */
function drawnOrder(): string[] {
  const order: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') order.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk(node.children);
  };
  walk(screen.toJSON());
  return order;
}

describe.each<Shell>(['CommunityScreen', 'CreatorScreen'])('%s given a list', (shell) => {
  it('draws the screen’s content, then the rows, then what follows them', () => {
    renderShell(shell);
    const order = drawnOrder();
    const at = (text: string) => order.indexOf(text);

    expect(at('Filters above the list')).toBeGreaterThan(-1);
    expect(at('Saturday football')).toBeGreaterThan(at('Filters above the list'));
    expect(at('Monthly clinic')).toBeGreaterThan(at('Saturday football'));
    expect(at('Show more')).toBeGreaterThan(at('Monthly clinic'));
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });

  it('says the list is empty in place of rows, under the screen’s content', () => {
    renderShell(shell, { rows: [] });

    expect(screen.getByText('Filters above the list')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('draws its loading instead of all of it', () => {
    renderShell(shell, { load: { isLoading: true } });

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Filters above the list')).toBeNull();
    expect(screen.queryByText('Saturday football')).toBeNull();
  });

  it('can be pulled while its first read is in flight', () => {
    const onRefresh = jest.fn();
    renderShell(shell, { load: { isLoading: true, onRefresh } });

    expect(screen.UNSAFE_getByType(RefreshControl).props.onRefresh).toBe(onRefresh);
    expect(screen.queryByText('Show more')).toBeNull();
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });

  it('draws a failed read instead of all of it', () => {
    const error = new FinancialError({
      kind: 'network',
      message: 'We could not reach Diaspora',
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: false,
    });
    renderShell(shell, { load: { error, onRetry: jest.fn() } });

    expect(screen.getByText('We could not reach Diaspora')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('Filters above the list')).toBeNull();
    expect(screen.queryByText('Saturday football')).toBeNull();
  });

  it('pulls to refresh through the shell', () => {
    const onRefresh = jest.fn();
    renderShell(shell, { load: { onRefresh } });

    expect(screen.UNSAFE_getByType(RefreshControl).props.onRefresh).toBe(onRefresh);
  });

  it('turns the end navigation off while a footer is pinned', () => {
    renderShell(shell, { footer: <View><Text>Save</Text></View> });

    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.queryByLabelText('Primary navigation', { includeHiddenElements: true })).toBeNull();
  });

  it('raises the end navigation where no footer is pinned', () => {
    renderShell(shell);

    // Down until the member reaches the end; present all the same.
    expect(screen.queryByLabelText('Primary navigation', { includeHiddenElements: true })).not.toBeNull();
  });
});

it('keeps the gap notice above the first read’s spinner', () => {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CommunityScreen
          title="Recurring events"
          availability={{ gapKey: 'communityRealtime', gapCovers: 'part', isEnabled: false }}
          load={{ isLoading: true }}
          list={{ data: ROWS, keyExtractor: (row: Row) => row.id, renderItem: renderRow }}
        >
          <Text>Filters above the list</Text>
        </CommunityScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );

  expect(screen.queryByText(/Not available yet|Preview . not connected/i)).toBeTruthy();
  expect(screen.getByLabelText('Loading')).toBeTruthy();
  expect(screen.queryByText('Filters above the list')).toBeNull();
  expect(screen.queryByText('Saturday football')).toBeNull();
});

it('draws a gap notice above the screen’s content, inside the list', () => {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CommunityScreen
          title="Recurring events"
          availability={{ gapKey: 'communityRealtime', gapCovers: 'part', isEnabled: false }}
          list={{ data: ROWS, keyExtractor: (row: Row) => row.id, renderItem: renderRow }}
        >
          <Text>Filters above the list</Text>
        </CommunityScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  const order = drawnOrder();
  const notice = order.findIndex((text) => /Not available yet|Preview . not connected/i.test(text));

  expect(notice).toBeGreaterThan(-1);
  expect(order.indexOf('Filters above the list')).toBeGreaterThan(notice);
  expect(order.indexOf('Saturday football')).toBeGreaterThan(order.indexOf('Filters above the list'));
});
