/**
 * The navigation bar a stack screen raises at the end of its content, from all
 * three containers that raise it (FARCH-004, 27 Nov 2026).
 *
 * A ScrollView, a FlatList and now a FlashList raise the same bar. They shared
 * the decision by copy until the FlashList arrived; it is one hook now, and
 * these tests hold all three to it: the bar comes up at the end of the content,
 * it is already up when the content fits without scrolling, the inset it needs
 * is reserved from the start, and a list told not to draw it draws none.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import {
  ScrollEndFlashList,
  ScrollEndFlatList,
  ScrollEndScrollView,
} from '../ScrollEndNavigationMenu';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const ROWS = ['First row', 'Second row', 'Third row'];

type Container = 'ScrollView' | 'FlatList' | 'FlashList';

function renderContainer(container: Container, props: { endNavigation?: boolean } = {}) {
  const row = ({ item }: { item: string }) => <Text>{item}</Text>;
  const body =
    container === 'ScrollView' ? (
      <ScrollEndScrollView testID="body" endNavigation={props.endNavigation}>
        {ROWS.map((item) => (
          <Text key={item}>{item}</Text>
        ))}
      </ScrollEndScrollView>
    ) : container === 'FlatList' ? (
      <ScrollEndFlatList testID="body" data={ROWS} keyExtractor={(item) => item} renderItem={row} />
    ) : (
      <ScrollEndFlashList
        testID="body"
        data={ROWS}
        keyExtractor={(item) => item}
        renderItem={row}
        endNavigation={props.endNavigation}
      />
    );

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{body}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/** The bar, when a screen reader can reach it: hidden from assistive technology while it is down. */
const bar = () => screen.queryByLabelText('Primary navigation');

function scrollTo(offsetY: number, contentHeight = 2000) {
  fireEvent.scroll(screen.getByTestId('body'), {
    nativeEvent: {
      layoutMeasurement: { height: 800, width: 390 },
      contentOffset: { y: offsetY, x: 0 },
      contentSize: { height: contentHeight, width: 390 },
    },
  });
}

describe.each<Container>(['ScrollView', 'FlatList', 'FlashList'])('%s', (container) => {
  it('draws its content', () => {
    renderContainer(container);
    for (const item of ROWS) expect(screen.getByText(item)).toBeTruthy();
  });

  it('keeps the bar down mid-content and raises it at the end', () => {
    renderContainer(container);
    expect(bar()).toBeNull();

    scrollTo(400);
    expect(bar()).toBeNull();

    scrollTo(1150);
    expect(bar()).not.toBeNull();

    // Scrolling back up lowers it again.
    scrollTo(200);
    expect(bar()).toBeNull();
  });

  it('raises the bar at once when the content fits without scrolling', () => {
    renderContainer(container);
    const body = screen.getByTestId('body');

    fireEvent(body, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } } });
    expect(bar()).toBeNull();

    fireEvent(body, 'contentSizeChange', 390, 300);
    expect(bar()).not.toBeNull();
  });

  it('reserves room for the bar from the start, not when it appears', () => {
    renderContainer(container);
    const style = [screen.getByTestId('body').props.contentContainerStyle].flat(Infinity) as {
      paddingBottom?: number;
    }[];
    const paddingBottom = style.reduce((found, entry) => entry?.paddingBottom ?? found, 0);

    // The bar's height and the 34pt home indicator, before any scroll.
    expect(paddingBottom).toBeGreaterThan(34);
  });
});

describe.each<Container>(['ScrollView', 'FlashList'])('a %s told not to draw the bar', (container) => {
  it('draws none, even at the end', () => {
    renderContainer(container, { endNavigation: false });
    scrollTo(1150);
    expect(screen.queryByLabelText('Primary navigation', { includeHiddenElements: true })).toBeNull();
  });
});
