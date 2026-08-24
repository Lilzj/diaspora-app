// ─────────────────────────────────────────────────────────────────────────────
// Saved items — seven fabricated saves, and none of the real ones
//
// The store was an in-memory `Map` seeded with seven hard-coded identifiers and
// no API client at all:
//
//     ['list-1', 'Listing'], ['guide-001', 'Guide'], ['evt-1', 'Event'], …
//
// Those ids are the ones in `mockListings` / `mockGuides` / `mockEvents`, so
// **every member saw seven saved items they never saved**, rendered as genuine
// content. A real identifier matched no mock, so anything actually saved was
// filtered away by `saved/[category]`. And nothing survived a restart.
//
// Saving worked. Displaying what was saved did not.
//
// ── Why the bookmark id is the thing to hold ─────────────────────────────────
//
// `DELETE /bookmarks/{bookmarkId}` removes by the bookmark's own identifier, not
// by what was bookmarked. A store that keeps only content ids can save and never
// un-save.
// ─────────────────────────────────────────────────────────────────────────────

import { useSavedStore } from '../saved';
import * as api from '@/lib/bookmarks-api';

jest.mock('@/lib/bookmarks-api', () => ({
  fetchBookmarks: jest.fn(),
  createBookmark: jest.fn(),
  deleteBookmark: jest.fn(),
}));

const fetchBookmarks = api.fetchBookmarks as jest.Mock;
const createBookmark = api.createBookmark as jest.Mock;
const deleteBookmark = api.deleteBookmark as jest.Mock;

function bookmark(contentId: string, contentType = 'Listing', bookmarkId = `bm-${contentId}`) {
  return { bookmarkId, contentId, contentType, note: null, createdAt: null };
}

/** Lets the optimistic write's promise settle before asserting on it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchBookmarks.mockReset();
  createBookmark.mockReset();
  deleteBookmark.mockReset();
  useSavedStore.setState({
    savedItems: new Map(),
    bookmarkIds: new Map(),
    isLoading: false,
    isLoaded: false,
    error: null,
  });
});

describe('nothing is saved until the member saves it', () => {
  it('starts empty rather than seeded', () => {
    // The defect, stated as an assertion: seven ids used to be here, and they
    // resolved against the mock data, so they rendered as real saved content.
    const { savedItems } = useSavedStore.getState();

    expect(savedItems.size).toBe(0);
    expect(savedItems.has('list-1')).toBe(false);
    expect(savedItems.has('guide-001')).toBe(false);
    expect(savedItems.has('evt-1')).toBe(false);
  });

  it('distinguishes "not loaded" from "loaded and empty"', () => {
    // Both are an empty map. Only one of them should render "you have not saved
    // anything yet".
    expect(useSavedStore.getState().isLoaded).toBe(false);
  });
});

describe('loading what the member actually saved', () => {
  it('holds a real identifier, which no mock ever matched', async () => {
    fetchBookmarks.mockResolvedValue([
      bookmark('01a01eb3-1225-7f27-a283-ea3cdbffec44', 'Marketplace'),
    ]);

    await useSavedStore.getState().load();

    expect(useSavedStore.getState().isSaved('01a01eb3-1225-7f27-a283-ea3cdbffec44')).toBe(true);
    expect(useSavedStore.getState().isLoaded).toBe(true);
  });

  it('keeps the bookmark id, without which nothing can be removed', async () => {
    fetchBookmarks.mockResolvedValue([bookmark('c1', 'Guide', 'bm-9')]);

    await useSavedStore.getState().load();

    expect(useSavedStore.getState().bookmarkIds.get('c1')).toBe('bm-9');
  });

  it('counts by category from the list rather than a separate call', async () => {
    fetchBookmarks.mockResolvedValue([
      bookmark('a', 'Guide'),
      bookmark('b', 'Guide'),
      bookmark('c', 'Housing'),
    ]);

    await useSavedStore.getState().load();

    expect(useSavedStore.getState().getCountByType('Guide')).toBe(2);
    expect(useSavedStore.getState().getCountByType('Housing')).toBe(1);
    expect(useSavedStore.getState().getCountByType('Job')).toBe(0);
  });

  it('does not empty the list when a refresh fails', async () => {
    fetchBookmarks.mockResolvedValue([bookmark('a')]);
    await useSavedStore.getState().load();

    fetchBookmarks.mockRejectedValue(new Error('offline'));
    await useSavedStore.getState().load();

    // Telling somebody their saved items are gone because one request failed is
    // worse than showing them slightly stale ones.
    expect(useSavedStore.getState().isSaved('a')).toBe(true);
    expect(useSavedStore.getState().error).toBeTruthy();
  });
});

describe('saving', () => {
  it('fills the heart immediately', () => {
    createBookmark.mockReturnValue(new Promise(() => {}));

    useSavedStore.getState().save('x', 'Event');

    // Before the round trip resolves. A control that waits reads as broken.
    expect(useSavedStore.getState().isSaved('x')).toBe(true);
  });

  it('keeps the id the server assigns, so it can be removed later', async () => {
    createBookmark.mockResolvedValue(bookmark('x', 'Event', 'bm-new'));

    useSavedStore.getState().save('x', 'Event');
    await settle();

    expect(useSavedStore.getState().bookmarkIds.get('x')).toBe('bm-new');
  });

  it('un-fills the heart when the server refuses', async () => {
    // A heart that stays filled after a failed save is a lie the member acts on.
    createBookmark.mockRejectedValue(new Error('refused'));

    useSavedStore.getState().save('x', 'Event');
    await settle();

    expect(useSavedStore.getState().isSaved('x')).toBe(false);
    expect(useSavedStore.getState().error).toBeTruthy();
  });

  it('does not save the same thing twice', () => {
    createBookmark.mockResolvedValue(bookmark('x'));

    useSavedStore.getState().save('x', 'Listing');
    useSavedStore.getState().save('x', 'Listing');

    expect(createBookmark).toHaveBeenCalledTimes(1);
  });
});

describe('un-saving', () => {
  it('deletes by the bookmark id, not the content id', async () => {
    fetchBookmarks.mockResolvedValue([bookmark('c1', 'Guide', 'bm-7')]);
    await useSavedStore.getState().load();
    deleteBookmark.mockResolvedValue(undefined);

    useSavedStore.getState().unsave('c1');
    await settle();

    // The distinction the old store could not have made: it never held an id.
    expect(deleteBookmark).toHaveBeenCalledWith('bm-7');
    expect(useSavedStore.getState().isSaved('c1')).toBe(false);
  });

  it('puts it back when the server refuses', async () => {
    fetchBookmarks.mockResolvedValue([bookmark('c1', 'Guide', 'bm-7')]);
    await useSavedStore.getState().load();
    deleteBookmark.mockRejectedValue(new Error('refused'));

    useSavedStore.getState().unsave('c1');
    await settle();

    expect(useSavedStore.getState().isSaved('c1')).toBe(true);
    expect(useSavedStore.getState().bookmarkIds.get('c1')).toBe('bm-7');
  });

  it('reloads rather than guessing when it has no id yet', async () => {
    // Saved a moment ago and the create has not answered. Inventing an id or
    // silently doing nothing would both leave the member's view disagreeing
    // with the server.
    fetchBookmarks.mockResolvedValue([]);
    useSavedStore.setState({ savedItems: new Map([['c2', 'Guide']]), bookmarkIds: new Map() });

    useSavedStore.getState().unsave('c2');
    await settle();

    expect(deleteBookmark).not.toHaveBeenCalled();
    expect(fetchBookmarks).toHaveBeenCalled();
  });
});
