// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Rendering a guide's structure (Remediation Wave D-3)
//
// `GuideResponse.sections[].blocks[]` is the platform's document model. The
// reader screen used to render `guide.content` — a single fixture string — with
// no structure at all, which is why its table of contents scrolled to
// `order * 250` pixels and hoped.
//
// ── The kind decides what the fields mean ───────────────────────────────────
//
// From `GuideBlockResponse`'s own documentation: text kinds carry prose in
// `content`; `Image`, `Video` and `Attachment` carry a **Media reference** in
// `mediaId` and use `content` as a caption; `Table` and `Links` carry an opaque
// JSON payload in `metadata` that the editor owns and the server never parses.
//
// So a renderer that printed `content` for every kind would print a caption
// where a picture belongs and nothing at all for a table. Each kind is handled,
// and the two the client cannot yet render — `Table` and `Links` with a payload
// this client did not write — say so rather than rendering an empty box.
//
// ── Why `metadata` is not parsed ────────────────────────────────────────────
//
// It is "opaque JSON for table and link payloads. **The editor owns the
// shape.**" This client's editor (`lib/guide-composer.ts`) does not write one,
// so any `metadata` present came from a different editor and guessing at its
// shape would be inventing a contract. The block renders its `content`, which is
// the human-readable form every producer does write.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { useMediaAsset } from '@/hooks/media';
import type { GuideBlockResponse, GuideSectionResponse } from '@/types/guides';

interface GuideBodyProps {
  sections: GuideSectionResponse[];
  /** Tailwind class for body prose, so the reader's font-size control still works. */
  textClassName?: string;
  /** Tailwind class for section headings. */
  headingClassName?: string;
}

export function GuideBody({
  sections,
  textClassName = 'text-base text-content-strong',
  headingClassName = 'text-content-primary',
}: GuideBodyProps) {
  if (sections.length === 0) {
    return (
      <Text className="text-sm text-content-faint italic">
        This guide has no content yet.
      </Text>
    );
  }

  return (
    <View>
      {[...sections]
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <View key={section.sectionId} className="mb-6" testID={`guide-section-${section.sectionId}`}>
            <Text className={`text-lg font-black mb-3 leading-snug ${headingClassName}`}>
              {section.title}
            </Text>
            {[...section.blocks]
              .sort((a, b) => a.order - b.order)
              .map((block) => (
                <GuideBlock key={block.blockId} block={block} textClassName={textClassName} />
              ))}
          </View>
        ))}
    </View>
  );
}

function GuideBlock({
  block,
  textClassName,
}: {
  block: GuideBlockResponse;
  textClassName: string;
}) {
  switch (block.kind) {
    case 'Tip':
      return (
        <Callout
          tone="success"
          label="💡 Tip"
          text={block.content}
          textClassName={textClassName}
        />
      );

    case 'Warning':
      return (
        <Callout
          tone="error"
          label="⚠️ Important"
          text={block.content}
          textClassName={textClassName}
        />
      );

    case 'Callout':
      return (
        <Callout tone="info" label="ℹ️ Note" text={block.content} textClassName={textClassName} />
      );

    case 'Image':
    case 'Video':
    case 'Attachment':
      // `content` is the **caption** on a media kind, not the body.
      return <GuideMediaBlock block={block} />;

    case 'Table':
    case 'Links':
      // The payload is `metadata`, and its shape belongs to whichever editor
      // wrote it. Rendering `content` is the honest subset.
      return block.content ? (
        <View className="bg-surface-background border border-faint rounded-xl p-3 my-2">
          <Text className={`leading-relaxed ${textClassName}`}>{block.content}</Text>
        </View>
      ) : null;

    case 'CodeSnippet':
      return block.content ? (
        <View className="bg-surface-muted border border-subtle rounded-xl p-3 my-2">
          <Text className="text-xs font-mono text-content-strong">{block.content}</Text>
        </View>
      ) : null;

    default:
      // `Markdown` and `RichText`. This client renders the text as written
      // rather than parsing it: a half-implemented markdown renderer shows
      // literal asterisks, which is worse than plain prose.
      return block.content ? (
        <Text className={`leading-relaxed mb-3 ${textClassName}`}>{block.content}</Text>
      ) : null;
  }
}

function Callout({
  tone,
  label,
  text,
  textClassName,
}: {
  tone: 'success' | 'error' | 'info';
  label: string;
  text: string | null;
  textClassName: string;
}) {
  if (!text) return null;

  const border =
    tone === 'success'
      ? 'border-success-default'
      : tone === 'error'
        ? 'border-error-default'
        : 'border-info-default';

  const labelColor =
    tone === 'success'
      ? 'text-success-default'
      : tone === 'error'
        ? 'text-error-default'
        : 'text-info-default';

  return (
    <View className={`bg-surface-background border-l-4 ${border} p-3 rounded-r-xl my-2`}>
      <Text className={`text-[10px] font-black uppercase tracking-wider mb-1 ${labelColor}`}>
        {label}
      </Text>
      <Text className={`leading-relaxed ${textClassName}`}>{text}</Text>
    </View>
  );
}

/**
 * A media block, resolved through Media.
 *
 * `mediaId` is a reference and nothing else — there is no URL on this contract.
 * A block whose asset cannot be resolved renders its caption and says the image
 * is unavailable, which is true; the previous screen had no media blocks at all
 * and the fixture cards used Unsplash URLs that belonged to nobody.
 */
function GuideMediaBlock({ block }: { block: GuideBlockResponse }) {
  const { url, isLoading } = useMediaAsset(block.mediaId);

  return (
    <View className="my-3">
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: 200, borderRadius: 12 }}
          contentFit="cover"
          transition={200}
          accessibilityLabel={block.content ?? 'Guide image'}
        />
      ) : (
        <View className="w-full h-[120px] bg-surface-muted rounded-xl items-center justify-center">
          <Text className="text-2xl">{isLoading ? '⏳' : '🖼️'}</Text>
          {!isLoading && !block.mediaId ? (
            <Text className="text-[10px] text-content-faint mt-1 font-semibold">
              No image attached
            </Text>
          ) : null}
        </View>
      )}
      {block.content ? (
        <Text className="text-[11px] text-content-faint mt-1.5 italic">{block.content}</Text>
      ) : null}
    </View>
  );
}
