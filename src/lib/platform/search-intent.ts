// ─────────────────────────────────────────────────────────────────────────────
// Reading a search sentence, without AI (owner, 5 Nov 2026)
//
// "Is it possible to use natural language to search without involving AI?
// providers near me, housing near me, jobs near me, where to braid my hair near
// me, or where to braid my hair in Grand Baie, 3-bedroom flat in Grand Baie,
// individual house in Port Louis."
//
// It is, with plain rules, because a search sentence has few parts:
//
//   what kind of thing   homes, jobs, things to buy, or else a service
//   the filters it names "3-bedroom", "flat", "individual house", "part-time"
//   where                "near me", or "in <a place>"
//   the words left       "braid hair", matched by the server on any word, which
//                        also finds the services filed under a category they name
//
// This file only reads. It cannot know whether "Grand Baie" is a town, so a
// named place comes back as candidates for `search-place.ts` to look up, longest
// first; when none is a town the words go back into the search, so "work in
// construction" still searches for construction.
// ─────────────────────────────────────────────────────────────────────────────

export type SearchTab = 'Providers' | 'Jobs' | 'Housing' | 'Marketplace';

/** One way to read the place: these words are the town, the rest are searched. */
export interface PlaceCandidate {
  name: string;
  rest: string;
}

export type SearchPlace =
  | { kind: 'near-me' }
  | {
      kind: 'named';
      /** The place as written, lower case: "grand baie for rent" reads "grand baie". */
      said: string;
      /** Longest first: "rose hill", then "rose". */
      candidates: PlaceCandidate[];
      /** The words to search when none of the candidates is a town. */
      asWords: string;
    };

export interface SearchIntent {
  /** What the member typed, trimmed. */
  said: string;
  tab: SearchTab;
  /** The words to match, outside the place. */
  words: string;
  place: SearchPlace | null;
  minBedrooms: number | null;
  /** Accommodation type keys, as `GET /housing/search` binds `accommodationTypes`. */
  homeTypes: string[];
  /** One of `JOB_TYPE_CHOICES` ("Part-Time"), or null. */
  jobType: string | null;
}

// ── The rules ────────────────────────────────────────────────────────────────
//
// Every pattern reads a sentence written as " word word word ": lower case,
// punctuation turned into spaces, one space between words and one at each end.
// A pattern starts with a space and ends looking at one, so it only ever matches
// whole words.

const NEAR_ME =
  / (?:(?:near|around|close to|next to) (?:me|us|here|my (?:place|location|area|home|house))|(?:in|around) (?:my|this) (?:area|town|city|neighbou?rhood|locality)|around here|near by|nearby|close by)(?= )/;

const NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, single: 1,
};

const BEDROOMS =
  / (\d{1,2}|one|two|three|four|five|six|seven|eight|single)(?: |-)?(?:bed(?:room)?s?|bhk|br)(?= )/;

/** Most particular first, so "shared room" is not also a private one. */
const HOME_TYPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ (?:individual|detached|independent|whole|entire|standalone|stand-alone) (?:house|home)s?(?= )/, 'house'],
  [/ shared rooms?(?= )/, 'shared-room'],
  [/ (?:room ?mates?|flat ?mates?|house ?mates?)(?= )/, 'roommate-wanted'],
  [/ studio (?:flats?|apartments?|apts?)(?= )/, 'studio'],
  [/ (?:flats?|apartments?|apts?|appartements?)(?= )/, 'apartment'],
  [/ (?:houses?|bungalows?|town ?houses?)(?= )/, 'house'],
  [/ villas?(?= )/, 'villa'],
  [/ duplex(?:es)?(?= )/, 'duplex'],
  [/ hostels?(?= )/, 'hostel'],
  [/ (?:private )?rooms?(?= )/, 'private-room'],
];

/** "Recording studio" is a service; "studio for rent" is a home. */
const STUDIO = / studios?(?= )/;

const HOUSING_WORDS =
  / (?:housing|accommodations?|lodgings?|to let|for rent|to rent|place to (?:stay|live)|somewhere to (?:stay|live)|real estate)(?= )/;

/** A home word beside one of these is a service: "house cleaning", "flat repair". */
const SERVICE_WORDS =
  / (?:clean(?:ing|er|ers)?|repairs?|repairing|fix(?:ing)?|paint(?:ing|er|ers)?|moving|movers?|removals?|plumb(?:ing|er|ers)|electricians?|electrical|sitt(?:ing|er|ers)|keep(?:ing|er|ers)|insurance|maids?|services?|helpers?|design|decor(?:ation)?|builders?|building|construction|renovations?|renovating|security|wash(?:ing)?|garden(?:ing|er|ers)?|pest|tiling|roofing|carpent(?:ry|er|ers)|interiors?)(?= )/;

const JOB_WORDS =
  / (?:jobs?|work|working|vacanc(?:y|ies)|hiring|recruiting|careers?|employment|positions?|openings?|internships?|gigs?)(?= )/;

/** The first two say "job" on their own; the others only beside a job word. */
const JOB_TYPES: ReadonlyArray<readonly [RegExp, string, boolean]> = [
  [/ part(?: |-)?time(?= )/, 'Part-Time', true],
  [/ full(?: |-)?time(?= )/, 'Full-Time', true],
  [/ (?:freelance|freelancer|freelancing)(?= )/, 'Freelance', false],
  [/ (?:temporary|temp)(?= )/, 'Temporary', false],
  [/ (?:volunteer|volunteering)(?= )/, 'Volunteer', false],
  [/ contract(?= )/, 'Contract', false],
];

const MARKET_WORDS =
  / (?:buy|buying|sell|selling|for sale|on sale|second(?: |-)?hand|pre-owned|marketplace|market place)(?= )/;

/** Words that only say "a service", which the tab already says. */
const PROVIDER_WORDS =
  / (?:providers?|services?|business(?:es)?|professionals?|experts?|specialists?|someone|somebody|people|person|places?|shops?|stores?)(?= )/;

/** The words that introduce a place. */
const PLACE_WORD = / (?:in|at|around|near|close to|within) (?=\S)/g;

/**
 * A place word followed by one of these is not a place: "at home", "in the evening". A "the"
 * in front is skipped first, so "in the UK" is a place and "in the city" is not.
 */
const NOT_A_PLACE = new Set([
  'me', 'here', 'home', 'a', 'an', 'my', 'this', 'that', 'need', 'person', 'english', 'french',
  'total', 'general', 'night', 'weekend', 'weekends', 'morning', 'mornings', 'evening', 'evenings',
  'afternoon', 'afternoons', 'today', 'tomorrow', 'time', 'advance', 'stock', 'bulk', 'cash', 'hand',
  'front', 'town', 'city', 'area', 'centre', 'center', 'country', 'world',
]);

/** A town's name ends before one of these: "Grand Baie for rent", "Rose Hill with parking". */
const ENDS_A_PLACE = new Set([
  'for', 'with', 'without', 'under', 'below', 'above', 'over', 'less', 'more', 'max', 'maximum', 'min',
  'minimum', 'from', 'that', 'which', 'who', 'and', 'or', 'please', 'to', 'by', 'near', 'at', 'in',
  'around', 'per', 'budget', 'cheap', 'starting', 'between', 'within', 'not',
]);

const LONGEST_PLACE = 4;

/** Words that carry nothing a listing could match. The server drops most of them too. */
const FILLERS = new Set([
  'where', "where's", 'wheres', 'to', 'i', "i'm", 'im', "i'd", 'can', 'could', 'find', 'finding', 'get',
  'getting', 'want', 'wanted', 'wanna', 'need', 'needed', 'needing', 'looking', 'look', 'search',
  'searching', 'for', 'a', 'an', 'the', 'my', 'me', 'please', 'some', 'any', 'who', 'which', 'that', 'is',
  'are', 'there', 'of', 'with', 'and', 'or', 'on', 'at', 'in', 'near', 'around', 'best', 'good', 'top',
  'nice', 'cheap', 'affordable', 'recommend', 'recommended', 'how', 'what', "what's", 'do', 'does', 'help',
  'available', 'local', 'here', 'nearby', 'by', 'from', 'it', 'one', 'someone', 'somebody',
]);

// ── Reading ──────────────────────────────────────────────────────────────────

export function readSearch(text: string): SearchIntent {
  const said = (text ?? '').trim();
  let sentence = prepare(said);

  const nearMe = NEAR_ME.test(sentence);
  sentence = strip(sentence, NEAR_ME);

  // What the sentence names, before deciding what it is about.
  const bedroomsMatch = sentence.match(BEDROOMS);
  const bedrooms = bedroomsMatch ? NUMBERS[bedroomsMatch[1]] ?? Number(bedroomsMatch[1]) : null;

  let withoutHomeTypes = sentence;
  const homeTypes: string[] = [];
  for (const [pattern, key] of HOME_TYPES) {
    if (pattern.test(withoutHomeTypes)) {
      if (!homeTypes.includes(key)) homeTypes.push(key);
      withoutHomeTypes = strip(withoutHomeTypes, pattern);
    }
  }

  const housingWords = HOUSING_WORDS.test(sentence);
  const aboutHomes = bedrooms !== null || housingWords || homeTypes.length > 0;
  if (aboutHomes && STUDIO.test(withoutHomeTypes)) {
    homeTypes.push('studio');
    withoutHomeTypes = strip(withoutHomeTypes, STUDIO);
  }

  const isHousing =
    bedrooms !== null || housingWords || (homeTypes.length > 0 && !SERVICE_WORDS.test(sentence));

  const jobWords = JOB_WORDS.test(sentence);
  const jobType = JOB_TYPES.find(([pattern, , saysJob]) => (saysJob || jobWords) && pattern.test(sentence));
  const isJob = !isHousing && (jobWords || jobType !== undefined);

  const isMarket = !isHousing && !isJob && MARKET_WORDS.test(sentence);

  const tab: SearchTab = isHousing ? 'Housing' : isJob ? 'Jobs' : isMarket ? 'Marketplace' : 'Providers';

  // What is left to match: the kind and the filters are said by the tab now.
  let rest = sentence;
  if (tab === 'Housing') {
    rest = strip(strip(withoutHomeTypes, BEDROOMS), HOUSING_WORDS);
  } else if (tab === 'Jobs') {
    rest = JOB_TYPES.reduce((left, [pattern]) => strip(left, pattern), strip(rest, JOB_WORDS));
  } else if (tab === 'Marketplace') {
    rest = strip(rest, MARKET_WORDS);
  }
  rest = strip(rest, PROVIDER_WORDS);

  const named = nearMe ? null : namedPlace(rest);

  return {
    said,
    tab,
    words: named ? named.before : cleanup(rest),
    place: nearMe ? { kind: 'near-me' } : named ? named.place : null,
    minBedrooms: tab === 'Housing' ? bedrooms : null,
    homeTypes: tab === 'Housing' ? homeTypes : [],
    jobType: tab === 'Jobs' && jobType ? jobType[1] : null,
  };
}

/** The words to search once the place is known: the town's leftovers, or all of it when no town was found. */
export function searchWords(intent: SearchIntent, found: PlaceCandidate | null): string {
  if (intent.place?.kind !== 'named') return intent.words;

  return join(intent.words, found ? found.rest : intent.place.asWords);
}

function namedPlace(sentence: string): { before: string; place: SearchPlace } | null {
  // The last place word whose next word could start a place: "jobs in hospitality in Port Louis".
  let chosen: { start: number; end: number } | null = null;

  for (const match of sentence.matchAll(PLACE_WORD)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const first = placeWords(sentence.slice(end))[0] ?? '';

    if (first && !NOT_A_PLACE.has(first) && !/^\d/.test(first)) {
      chosen = { start, end };
    }
  }

  if (!chosen) return null;

  const tail = placeWords(sentence.slice(chosen.end));
  const spanEnd = tail.findIndex((word, index) => index >= LONGEST_PLACE || ENDS_A_PLACE.has(word) || /^\d/.test(word));
  const span = tail.slice(0, spanEnd === -1 ? Math.min(tail.length, LONGEST_PLACE) : spanEnd);

  if (span.length === 0) return null;

  const after = tail.slice(span.length);
  const candidates: PlaceCandidate[] = [];

  for (let length = span.length; length >= 1; length -= 1) {
    candidates.push({
      name: span.slice(0, length).join(' '),
      rest: cleanup(` ${[...span.slice(length), ...after].join(' ')} `),
    });
  }

  return {
    before: cleanup(sentence.slice(0, chosen.start + 1)),
    place: {
      kind: 'named',
      said: span.join(' '),
      candidates,
      asWords: cleanup(` ${tail.join(' ')} `),
    },
  };
}

/** The words after a place word, without a "the" in front. */
function placeWords(text: string): string[] {
  const words = text.trim().split(' ').filter(Boolean);

  return words[0] === 'the' ? words.slice(1) : words;
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

/** " word word ": lower case, punctuation as spaces, one space between words and at each end. */
function prepare(text: string): string {
  const spaced = text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:()[\]{}"“”/\\|+*=<>@#$%^&~_]+/g, ' ')
    .replace(/(^|\s)[-']+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ` ${spaced} `;
}

function strip(sentence: string, pattern: RegExp): string {
  const everywhere = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

  return sentence.replace(everywhere, ' ').replace(/ {2,}/g, ' ');
}

/** "under Rs 5,000 per month": a price frames a search, and no listing matches it as words. */
const PRICE_WORDS = new Set([
  'under', 'below', 'less', 'than', 'max', 'maximum', 'min', 'minimum', 'budget', 'upto', 'up', 'per',
  'month', 'months', 'monthly', 'rs', 'mur', 'usd', 'eur', 'gbp', 'ngn', 'ghs', 'kes', 'zar', 'inr',
]);

/** A number, or an amount with its currency sign: "20000", "5,000", "€900", "2k". */
const AMOUNT = /^[$€£₦₹]?\d[\d.,]*k?$/;

function cleanup(sentence: string): string {
  return sentence
    .trim()
    .split(' ')
    .filter((word) => word && !FILLERS.has(word) && !PRICE_WORDS.has(word) && !AMOUNT.test(word))
    .join(' ');
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}
