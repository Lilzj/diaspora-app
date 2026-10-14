/**
 * Offering something to swap — 15 Sep 2026.
 *
 * The screen posted a made-up seller ("Amara Kone", a 4.8 rating) and said
 * "Swap Listed!" whatever came back. These render it and walk it: the request
 * is the member's own Swap listing, and what the member is told is what the
 * platform answered — published, saved as a draft, or not saved.
 */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';

const mockCreateAndPublish = jest.fn();
const mockShowAlert = jest.fn();

jest.mock('@/lib/marketplace-listings-api', () => ({
  ...jest.requireActual('@/lib/marketplace-listings-api'),
  createAndPublishMarketplaceListing: (...args: unknown[]) => mockCreateAndPublish(...args),
}));

// The served taxonomy (13 Oct 2026). One category is enough for the screen.
const mockBicycles = { categoryId: 'c-1', key: 'bicycles', name: 'Bicycles', depth: 0, order: 1, isActive: true };
jest.mock('@/hooks/marketplace-categories', () => ({
  useMarketplaceCategories: () => ({
    topCategories: [mockBicycles],
    childrenOf: () => [],
    find: (key: string | null) => (key === 'bicycles' ? mockBicycles : undefined),
    isLoading: false,
  }),
}));

// The shared town search (14 Oct 2026: Google, then the place catalogue); here
// it knows no towns, so the member uses the one they type, as the picker offers.
jest.mock('@/lib/town-search', () => ({
  searchTowns: jest.fn().mockResolvedValue({ towns: [], attribution: null, unavailable: false }),
  resolveTown: jest.fn((town: unknown) => Promise.resolve(town)),
}));

jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

// The upload is the media pipeline's; here the member has chosen a photo.
jest.mock('@/components/ImagePickerInput', () => ({
  ImagePickerInput: ({ onChangeImage, value }: { onChangeImage: (id: string) => void; value: string | null }) => {
    const { TouchableOpacity: Touchable, Text: Label } = require('react-native');
    return (
      <Touchable onPress={() => onChangeImage('01a0a0aa-0000-7000-8000-00000000f070')}>
        <Label>{value ? 'Photo chosen' : 'Add photo'}</Label>
      </Touchable>
    );
  },
}));

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

// eslint-disable-next-line import/first
import SwapCreateScreen from '../marketplace/swap-create';

// Unused imports kept honest for the mock factory above.
void Text;
void TouchableOpacity;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Each walk renders four steps of a form; under a full parallel run the first
// one outlasted the default five seconds while passing alone in one.
jest.setTimeout(30000);

function signIn(grantedFeatures: string[] = ['marketplace.listings.create']) {
  useAuthStore.setState({
    user: { userId: 'david', fullName: 'David Mensah', residenceCountry: 'MU' } as never,
    access: { grantedFeatures } as never,
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <SwapCreateScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Fill every step, as a member would. */
async function fillIn() {
  fireEvent.changeText(screen.getByLabelText('Item title'), "Child's bicycle");
  fireEvent.changeText(screen.getByLabelText('Description'), 'Outgrown, rides well.');
  // The shared dropdown with search (14 Oct 2026), not a bottom sheet.
  fireEvent.press(screen.getByLabelText('Category: Choose a category'));
  fireEvent.press(screen.getByText(/Bicycles/));
  fireEvent.press(screen.getByText('Add photo'));
  fireEvent.press(screen.getByText('Continue'));

  fireEvent.changeText(screen.getByLabelText('What you want in exchange'), 'A bigger bicycle');
  fireEvent.press(screen.getByText('Continue'));

  // No country field: the swap is filed in the member's residence (MU). The
  // town comes from the shared TownPicker, used as typed.
  expect(screen.queryByLabelText('Country code')).toBeNull();
  fireEvent.press(screen.getByLabelText('Town: choose'));
  fireEvent.changeText(screen.getByPlaceholderText('Search for your town'), 'Rose Hill');
  fireEvent.press(await screen.findByText('Use “Rose Hill”'));
  // The pick is confirmed once the town is looked up (asynchronously).
  await waitFor(() => expect(screen.getByLabelText('Town: Rose Hill. Change')).toBeTruthy());
  fireEvent.press(screen.getByText('Continue'));

  await waitFor(() => expect(screen.getByText('Publish swap')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
});

describe('listing a swap', () => {
  it('lists the member’s own Swap and says it is listed only when it was published', async () => {
    mockCreateAndPublish.mockResolvedValue({ kind: 'published', listingId: 'listing-1' });
    renderScreen();

    await fillIn();
    expect(screen.getByText('A bigger bicycle')).toBeTruthy();
    fireEvent.press(screen.getByText('Publish swap'));

    await waitFor(() => expect(mockCreateAndPublish).toHaveBeenCalledTimes(1));
    const [request, seller] = mockCreateAndPublish.mock.calls[0];

    expect(request).toMatchObject({
      listingType: 'Swap',
      categoryKey: 'bicycles',
      countryCode: 'MU',
      cityName: 'Rose Hill',
      mediaIds: ['01a0a0aa-0000-7000-8000-00000000f070'],
    });
    expect(request.attributes).toContainEqual(
      expect.objectContaining({ key: 'swap-wants', value: 'A bigger bicycle' })
    );
    expect(request).not.toHaveProperty('seller');
    expect(seller).toEqual({ displayName: 'David Mensah', countryCode: 'MU' });

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    const alert = mockShowAlert.mock.calls[0][0];
    expect(alert).toMatchObject({ type: 'success', title: 'Swap listed' });

    alert.buttons[0].onPress();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/marketplace/[id]', params: { id: 'listing-1' } });
  });

  it('says it was saved as a draft, in the server’s words, when publication was refused', async () => {
    mockCreateAndPublish.mockResolvedValue({
      kind: 'draft-only',
      listingId: 'listing-2',
      reason: 'incomplete',
      detail: 'Before this listing can be published it still needs what you would take in exchange. [missing: wants]',
    });
    renderScreen();

    await fillIn();
    fireEvent.press(screen.getByText('Publish swap'));

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    const alert = mockShowAlert.mock.calls[0][0];
    expect(alert.type).toBe('info');
    expect(alert.title).toBe('Saved as a draft');
    expect(alert.message).toContain('what you would take in exchange');
  });

  it('says the swap was not saved when creating it failed', async () => {
    mockCreateAndPublish.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();

    await fillIn();
    fireEvent.press(screen.getByText('Publish swap'));

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    const alert = mockShowAlert.mock.calls[0][0];
    expect(alert).toMatchObject({ type: 'error', title: 'Swap not saved' });
  });

  /**
   * **This used to assert the alert, which was the thing being replaced.** It
   * pressed Continue and expected an error popup naming the photo — so it
   * described, precisely and in passing green, the behaviour that made a member
   * tap a live button to find out what was missing. Asking for the photo before
   * the tap is the fix, and the fix broke the test.
   *
   * What it checks now is both halves of the rule: the button refuses, and the
   * screen says what for, without the member having to do anything.
   */
  it('names the photo it is waiting for, without being tapped', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Item title'), "Child's bicycle");
    fireEvent.changeText(screen.getByLabelText('Description'), 'Outgrown, rides well.');
    fireEvent.press(screen.getByLabelText('Category: Choose a category'));
    fireEvent.press(screen.getByText(/Bicycles/));

    expect(screen.getByText(/Still needed: .*Photo/)).toBeTruthy();

    fireEvent.press(screen.getByText('Continue'));

    // Still on the first step, and no popup: the button did not act.
    expect(mockShowAlert).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Item title')).toBeTruthy();
  });

  it('is locked for a member whose account may not sell', () => {
    signIn([]);
    renderScreen();

    expect(screen.getByText('Listing swaps is locked for now')).toBeTruthy();
    expect(screen.queryByLabelText('Item title')).toBeNull();
  });
});

describe('the screen source', () => {
  it('carries no invented seller and no unconditional success', () => {
    // Comments stripped: the header records the removed fabrication by name.
    const source = fs
      .readFileSync(path.join(process.cwd(), 'src', 'app', 'marketplace', 'swap-create.tsx'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

    expect(source).not.toMatch(/Amara Kone|user-123|rating: 4\.8|Swap Listed!/);
    expect(source).not.toContain("apiClient.post('/marketplace/listings'");
  });

  it('picks its category and town with the shared controls and asks no country', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'marketplace', 'swap-create.tsx'), 'utf8');
    expect(source).toContain('<SearchableSelect');
    expect(source).toContain('<TownPicker');
    expect(source).not.toContain('accessibilityLabel="Country code"');
  });
});
