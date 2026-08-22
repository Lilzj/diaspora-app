// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The guide editor's document model (Remediation Wave D-3)
//
// `guide/create.tsx` writes into one free-text box with a formatting toolbar
// that inserts `[TIP]…[/TIP]`, `[WARNING]…[/WARNING]`, `[CALLOUT]…[/CALLOUT]`,
// `[IMAGE]…[/IMAGE]` and `[LINK]label | url[/LINK]`. That markup is the
// *editor's*, not the platform's — the server has never seen it.
//
// The platform's document model is `GuideSectionInput[]`, each section holding
// `GuideBlockInput[]` with a `GuideBlockKind`. This module is the translation,
// and it exists as its own file because it is the one piece of the create screen
// that is worth testing without mounting a screen.
//
// ── Why the markers map to block kinds rather than to prose ─────────────────
//
// The toolbar's five markers correspond **exactly** to five of the eleven kinds
// the server already ships: `Tip`, `Warning`, `Callout`, `Image` and `Links`.
// Posting the whole thing as one `Markdown` block would have been less work and
// would have thrown the structure away at the moment of saving it: a guide
// stored as one block cannot be diffed section by section, cannot have a
// suggestion targeted at part of it, and renders on every other client as a wall
// of literal `[TIP]` text.
//
// ── The section identifiers are stable, and that is load-bearing ────────────
//
// `GuideSectionInput.sectionId` is "supplied by the client and stable across
// saves — it is what version diffs match sections by, so 'renamed' and
// 'replaced' stay distinguishable years later." A composer that minted fresh
// identifiers on every keystroke would make every save look like a full
// replacement in the version history. `composeGuideDocument` therefore takes the
// identifiers it should reuse, and the create screen holds them for the lifetime
// of the draft.
//
// ── What it deliberately does not do ────────────────────────────────────────
//
// It does not upload anything. `[IMAGE]https://…[/IMAGE]` in the editor carries
// a **URL the member typed**, and the platform stores media by reference and
// never by URL (ADR-005). A typed URL therefore becomes a `Markdown` block
// containing the link text rather than an `Image` block with a fabricated
// `mediaId`, and the hero image — which really is a `mediaId`, from
// `ImagePickerInput` — is attached through `POST /guides/{id}/media` instead.
// ─────────────────────────────────────────────────────────────────────────────

import { newIdempotencyKey } from './idempotency';
import { GUIDE_BLOCK_MAX_LENGTH, GUIDE_MAX_BLOCKS_PER_SECTION } from './guides-api';
import type { GuideBlockInput, GuideBlockKind, GuideSectionInput } from '@/types/guides';

/**
 * A v4-shaped identifier for a section or a block.
 *
 * Shares `newIdempotencyKey`'s generator rather than adding a dependency: the
 * requirement is identical — a collision-avoidance token, never a secret, never
 * used for authorisation. The server binds these as `Guid`, so the RFC 4122
 * shape is the contract and `Math.random` is an acceptable source for it.
 */
export function newDocumentId(): string {
  return newIdempotencyKey();
}

/** The editor's five markers, in the order the splitter must try them. */
const MARKER_PATTERN =
  /(\[TIP\][\s\S]*?\[\/TIP\]|\[WARNING\][\s\S]*?\[\/WARNING\]|\[CALLOUT\][\s\S]*?\[\/CALLOUT\]|\[IMAGE\][\s\S]*?\[\/IMAGE\]|\[LINK\][\s\S]*?\[\/LINK\])/g;

interface ParsedFragment {
  kind: GuideBlockKind;
  content: string;
}

/**
 * Splits the editor's text into typed fragments.
 *
 * Exported for the tests. A fragment whose content is empty after trimming is
 * dropped — the toolbar inserts a marker pair and a placeholder, and a member who
 * inserted one and deleted the placeholder should not publish an empty callout.
 */
export function parseEditorMarkup(raw: string): ParsedFragment[] {
  if (!raw.trim()) return [];

  return raw
    .split(MARKER_PATTERN)
    .map((token): ParsedFragment | null => {
      if (!token) return null;

      if (token.startsWith('[TIP]')) {
        return { kind: 'Tip', content: strip(token, 'TIP') };
      }
      if (token.startsWith('[WARNING]')) {
        return { kind: 'Warning', content: strip(token, 'WARNING') };
      }
      if (token.startsWith('[CALLOUT]')) {
        return { kind: 'Callout', content: strip(token, 'CALLOUT') };
      }
      if (token.startsWith('[IMAGE]')) {
        // A URL the member typed, not a `mediaId`. See the header: an `Image`
        // block requires a media reference and fabricating one would put a
        // dangling identifier into the document.
        const url = strip(token, 'IMAGE');
        return url ? { kind: 'Markdown', content: `Image: ${url}` } : null;
      }
      if (token.startsWith('[LINK]')) {
        const [label, url] = strip(token, 'LINK')
          .split('|')
          .map((part) => part.trim());
        if (!label && !url) return null;
        // `Links` carries an opaque JSON payload the editor owns; the content is
        // the human-readable form so a client that does not parse the payload
        // still renders something true.
        return { kind: 'Links', content: url ? `${label || url} — ${url}` : label };
      }

      return { kind: 'Markdown', content: token.trim() };
    })
    .filter((fragment): fragment is ParsedFragment => fragment !== null && fragment.content.length > 0);
}

function strip(token: string, marker: string): string {
  return token.replace(`[${marker}]`, '').replace(`[/${marker}]`, '').trim();
}

export interface ComposeOptions {
  /** The section title the editor's single body becomes. */
  sectionTitle?: string;
  /**
   * Identifiers to reuse, oldest first.
   *
   * Supply the ones from the previous save so a version diff reports "content
   * changed" rather than "every section replaced". Missing entries are minted.
   */
  reuseSectionIds?: string[];
  reuseBlockIds?: string[];
}

/**
 * The editor's text as a platform document.
 *
 * One section, because the create wizard offers one body. A future editor with
 * a section outline calls this once per section and concatenates — the shape is
 * already right for that.
 *
 * **Blocks past `GUIDE_MAX_BLOCKS_PER_SECTION` are dropped rather than sent.**
 * The server refuses the whole save with `guides.blocks.limit`, and losing the
 * two-hundred-and-first paragraph is better than losing all two hundred.
 */
export function composeGuideDocument(
  bodyText: string,
  options: ComposeOptions = {}
): GuideSectionInput[] {
  const fragments = parseEditorMarkup(bodyText);
  if (fragments.length === 0) return [];

  const reuseBlockIds = options.reuseBlockIds ?? [];

  const blocks: GuideBlockInput[] = fragments
    .slice(0, GUIDE_MAX_BLOCKS_PER_SECTION)
    .map((fragment, index) => ({
      blockId: reuseBlockIds[index] ?? newDocumentId(),
      kind: fragment.kind,
      order: index + 1,
      // The server refuses a block past its ceiling; truncating here would
      // silently lose text, so the length is left as the member wrote it and the
      // screen checks `exceedsBlockLimit` before it offers Publish.
      content: fragment.content,
      mediaId: null,
      metadata: null,
    }));

  return [
    {
      sectionId: options.reuseSectionIds?.[0] ?? newDocumentId(),
      title: options.sectionTitle?.trim() || 'Guide',
      order: 1,
      blocks,
    },
  ];
}

/**
 * Whether any block in the document is longer than the server will accept.
 *
 * Checked on the device so the member is told before they press Publish, rather
 * than by a 400 after four successful calls have already created a draft.
 */
export function exceedsBlockLimit(sections: GuideSectionInput[]): boolean {
  return sections.some((section) =>
    section.blocks.some((block) => (block.content ?? '').length > GUIDE_BLOCK_MAX_LENGTH)
  );
}

/** The identifiers a composed document used, so the next save can reuse them. */
export function documentIdentities(sections: GuideSectionInput[]): {
  sectionIds: string[];
  blockIds: string[];
} {
  return {
    sectionIds: sections.map((section) => section.sectionId),
    blockIds: sections.flatMap((section) => section.blocks.map((block) => block.blockId)),
  };
}

/**
 * The word count the server will compute.
 *
 * Mirrors the aggregate: words across every block's content. A screen that
 * counted the raw editor text instead would include the markers themselves and
 * disagree with the reading time on the card the member's guide ends up on.
 */
export function documentWordCount(sections: GuideSectionInput[]): number {
  return sections.reduce(
    (total, section) =>
      total +
      section.blocks.reduce(
        (blockTotal, block) =>
          blockTotal + (block.content ?? '').trim().split(/\s+/).filter(Boolean).length,
        0
      ),
    0
  );
}
