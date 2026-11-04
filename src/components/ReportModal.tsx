// ─────────────────────────────────────────────────────────────────────────────
// Report content — Remediation Wave B′
//
// This modal validated carefully, collected a category, supporting details and
// an evidence link, handed all three to an `onSubmit` prop — and then said:
//
//     Report submitted
//     Thank you for helping keep our community safe. Our moderators will review
//     this content and adjust trust ratings if necessary.
//
// **Every consumer's `onSubmit` was a `console.log`.** `marketplace/[id].tsx`
// logged and returned; `provider/[id].tsx` and `job/[id].tsx` logged and
// returned; `housing/[id].tsx` logged and then showed a *second* success alert
// of its own. Four screens, one component, and not one report ever left the
// device — while the member was told a moderator had it and that somebody's
// trust rating might move because of it.
//
// ── The form was already built against the right contract ────────────────────
//
// The striking thing about this one is how close it was. `POST
// /api/v1/community/reports` parses its `reason` through
// `CommunityWireNames.ParseReportReason`, which carries an explicit alias table:
//
//     "conflicting" → Misinformation
//     "inaccurate"  → Outdated
//     "abusive"     → Harassment
//     "spam", "other" parse directly
//
// Those are **exactly** this modal's five category keys, in order. And
// `ReportContentCommandHandler` requires `EvidenceUrl` for one input only — the
// literal string `"conflicting"` — which is precisely the one category this form
// has always demanded a link for. The form was written against the endpoint and
// the request was simply never made.
//
// So the keys go out verbatim rather than being mapped to canonical codes. That
// is deliberate: it preserves the evidence-required behaviour the UI already
// implements, and it avoids picking a side between two reason vocabularies that
// currently disagree — the backend's `ReportReasonCode` has `inappropriate`,
// `outdated` and `copyright`, while this client's `CommunityReportReason` has
// `hateSpeech` and `scam`. That mismatch is real and is recorded, but resolving
// it is not this wave's job, and guessing at it would be a way to send reasons
// the server rejects.
//
// ── Why the generic route and not the per-module ones ────────────────────────
//
// Marketplace and Housing each have their own report route
// (`POST /marketplace/listings/{id}/report`, singular; `POST
// /housing/listings/{id}/reports`, plural) with their own domain reason lists.
// Providers have **none at all** — `Diaspora.Modules.Providers` has no report
// route, no report DTO and no report entity, and `Provider.cs` says outright
// that reports "belong to B6".
//
// The generic Community route covers all four subjects through registered
// `ICommunityContentSource` implementations, takes one reason taxonomy, and
// returns one response shape. The per-module routes return three different
// things — nothing, a bare `Guid`, and a DTO. One modal cannot render three
// contracts honestly, and the provider case has no per-module route to fall back
// to, so the generic route is the only one that serves every consumer.
//
// ── The subject that could not be reported, and now can ──────────────────────
//
// This header used to end: *"**Jobs.** `CommunityContentType.Job` exists in the
// enum and is claimed by no content source … A job is unreportable end to end,
// and this modal says so rather than posting a request that is refused."*
//
// That was true and is no longer. `JobContentSource` claims the type, and the
// same sweep that re-checked this sentence found three more subjects in the same
// state — declared in B6's enum, claimed by nothing:
//
//   `Job`           → `JobContentSource`           (Diaspora.Modules.Jobs)
//   `Organization`  → `OrganizationContentSource`  (Diaspora.Modules.CommunityLife)
//   `Message`       → `MessageContentSource`       (Diaspora.Modules.Conversations)
//
// **`Member` was the one that got away, and it is back.** A source for it was
// written in Trust, worked at runtime, and was reverted: the platform's
// architecture tests refuse Trust depending on Identity's domain (ADR-002) and
// refuse any module depending on one composed after it (Trust 200 → Community
// 500). Both rules are right and neither was weakened.
//
// The blocker was never "a member cannot be described" — it was that nothing
// which may talk to Community could prove a member exists. Community holds its
// own member projection now (`CommunityMember`, fed by
// `UserRegisteredIntegrationEvent` and backfilled for everybody who registered
// before it), so `MemberContentSource` lives in Community itself and reaches
// into nothing. 693 of 693 architecture tests still pass.
//
// **A direct message was the worst of them.** Every other surface on the platform
// could be reported; the inbox — where harassment actually happens — could not.
// It is reportable now, and the source deliberately resolves *only for a
// participant*: a stranger asking about a message id gets
// `community.content.not-found`, exactly what they get for an id that does not
// exist, so the route cannot be used to probe somebody's inbox.
//
// **`Poll` is unclaimed too**, and this modal has never offered it as a subject,
// so no sentence here needs to say so.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { Sheet } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';
import { communityErrorMessage, reportContent } from '@/lib/community-social-api';
import type { CommunityContentType } from '@/types/community-social';

export interface ReportData {
  category: string;
  reason: string;
  conflictingLink?: string;
}

type ReportSubject =
  | 'Listing'
  | 'Job'
  | 'Guide'
  | 'Update'
  | 'Comment'
  | 'Housing'
  | 'Marketplace'
  | 'Event'
  | 'Organization'
  | 'Member'
  | 'Message';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: ReportSubject;
  contentId: string;
  /**
   * Fired **after** the server accepted the report, for a screen that wants to
   * react to it. Optional, and no longer the thing that files the report —
   * every implementation of it was a `console.log`, which is how four screens
   * came to confirm a report none of them sent.
   */
  onSubmit?: (data: ReportData) => void;
}

/**
 * This modal's subjects, in the wire vocabulary of
 * `Diaspora.Modules.Community`.
 *
 * `null` means the platform cannot carry a report about that subject at all.
 * The mapping is against registered content sources rather than against the
 * `CommunityContentType` enum, because membership of the enum is not acceptance
 * — `Job`, `Organization`, `Poll` and `Member` are all declared and all
 * rejected by `ContentReferenceResolver`.
 */
const SUBJECT_CONTENT_TYPE: Record<ReportSubject, CommunityContentType | null> = {
  // `MarketplaceContentSource`.
  Marketplace: 'marketplace',
  // `HousingContentSource`.
  Housing: 'housing',
  // `ProviderContentSource` claims `Listing`. A provider is reported as a
  // listing — there is an explicit `"provider"` alias for the same value, and
  // this is the only route by which a provider can be reported at all.
  Listing: 'listing',
  // `GuideContentSource`.
  Guide: 'guide',
  // `CommunityEventContentSource`. `Diaspora.Modules.CommunityLife` also has its
  // own `POST /community-life/{subjectType}/{subjectId}/reports` with a richer
  // domain reason list, but that route carries **no `RequireAuthorization`** at
  // the HTTP layer — it is gated only by the MediatR pipeline attribute — and it
  // returns a different response shape again. The generic route is the one this
  // modal can render honestly for every subject it serves.
  Event: 'event',
  // `update` and `communityupdate` are aliases of `Post` in `ContentTypeAliases`.
  Update: 'post',
  Comment: 'comment',
  // `JobContentSource`. Was `null` — no content source claimed the type and the
  // modal said so. It does now.
  Job: 'job',
  // `OrganizationContentSource`.
  Organization: 'organization',
  // `MemberContentSource`, in Community itself. Was `null` across several phases
  // for the architectural reason in the header, and BG-05a closed it: reporting a
  // person answers 201, a duplicate answers `community.report.duplicate`,
  // reporting yourself answers `community.report.self-content`, and a member is
  // never commentable — `community.comment.closed`.
  Member: 'member',
  // `MessageContentSource`. Resolves only for a participant in the conversation.
  Message: 'message',
};

/**
 * What the confirmation says, per subject.
 *
 * A member reporting a *person* or a *private message* is in a different
 * situation from one flagging a stale guide, and a single "thanks, a moderator
 * will look at this" reads as boilerplate to somebody who has just reported
 * harassment. Each of these names the next thing they can do themselves, because
 * a report is not an immediate remedy and pretending otherwise leaves them
 * waiting.
 */
const CONFIRMATION: Partial<Record<ReportSubject, string>> = {
  Message:
    'A moderator will review this message. Blocking the sender takes effect immediately and does '
    + 'not wait for a decision.',
  Job:
    'A moderator will review this posting. Please do not send money, share documents or pay any '
    + 'fee to apply while it is being looked at.',

  // A report about a *person* is a standing complaint rather than one about
  // something they wrote, and the two need different sentences. This one also
  // says what reporting does **not** do: it is not a block, and a member who
  // needs the messages to stop needs to do that separately and immediately.
  Member:
    'A moderator will review this account. Reporting does not block them — if you want their '
    + 'messages to stop now, block them as well.',
};

/**
 * The reasons offered for a piece of *content*.
 *
 * Unchanged, and mapped in `CommunityWireNames.ReasonAliases`: `conflicting` →
 * `Misinformation`, `inaccurate` → `Outdated`, `abusive` → `Harassment`.
 */
const CONTENT_CATEGORIES = [
  { key: 'conflicting', label: 'Conflicting information (with another post)' },
  { key: 'inaccurate', label: 'Inaccurate or outdated details' },
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'abusive', label: 'Abusive or offensive content' },
  { key: 'other', label: 'Other issues' },
];

/**
 * The reasons offered when the subject is a *person or an organisation*.
 *
 * ── Why this list is different ───────────────────────────────────────────────
 *
 * Reporting a person through the content list asked them to classify a human
 * being as "Conflicting information (with another post)" or "Inaccurate or
 * outdated details". Two of the five reasons were unanswerable, and the two a
 * person is most often reported for — exposing somebody's private details, and
 * conduct rather than a specific post — were not offered at all.
 *
 * That is not only a wording problem. The reason is what a moderator queue
 * sorts on: `PersonalData` "carries a legal clock" per the server's own
 * catalogue, and a report that could only be filed as `Other` arrives without
 * the one attribute that would prioritise it.
 *
 * Every key here is one the server already resolves — `ReasonAliases` plus
 * `CommunityWireNames.Parse`, which matches any spelling of an enum member. So
 * this widens which of the platform's **eight existing codes** a member can
 * reach; it does not invent a taxonomy, and nothing on the server changes.
 */
const SUBJECT_CATEGORIES = [
  { key: 'abusive', label: 'Harassment or abusive behaviour' },
  { key: 'inappropriate', label: 'Inappropriate or offensive conduct' },
  { key: 'spam', label: 'Spam, scams or unwanted advertising' },
  { key: 'personalData', label: "Shared someone's private information" },
  { key: 'other', label: 'Something else' },
];

/** A person and an organisation are reported for conduct; everything else for what it says. */
function categoriesFor(subject: ReportSubject) {
  return subject === 'Member' || subject === 'Organization'
    ? SUBJECT_CATEGORIES
    : CONTENT_CATEGORIES;
}

type Errors = { category?: string; reason?: string; conflictingLink?: string };

export function ReportModal({ visible, onClose, contentType, contentId, onSubmit }: ReportModalProps) {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [conflictingLink, setConflictingLink] = useState<string>('');
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wireContentType = SUBJECT_CONTENT_TYPE[contentType];
  const isReportable = wireContentType !== null;

  // A person or an organisation is reported for what they did; everything else
  // for what it says. The two need different reasons, and the heading above them
  // has to ask a question the list can answer.
  const isSubjectReport = contentType === 'Member' || contentType === 'Organization';
  const categories = categoriesFor(contentType);

  const reset = () => {
    setSelectedCategory('');
    setReason('');
    setConflictingLink('');
    setErrors({});
  };

  const handleSubmit = async () => {
    // Validation was three sequential `Alert.alert` calls, which surfaced one
    // problem at a time, said nothing about *which* field, and left no marker
    // on the field once dismissed.
    const next: Errors = {};
    if (!selectedCategory) next.category = 'Choose a category.';
    if (!reason.trim()) next.reason = 'Add supporting details for your report.';
    if (selectedCategory === 'conflicting' && !conflictingLink.trim()) {
      next.conflictingLink = 'Add a link to the conflicting post.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // Unreachable from the UI — the submit button is not rendered for an
    // unreportable subject — but a guard here rather than a request the server
    // is certain to refuse.
    if (!wireContentType) return;

    setIsSubmitting(true);

    try {
      const report = await reportContent({
        contentType: wireContentType,
        contentId,
        // Verbatim. See the header note on the alias table.
        reason: selectedCategory,
        description: reason.trim(),
        // `evidenceUrl` is mandatory server-side for `conflicting` only, which
        // is the one category this form has always required a link for.
        evidenceUrl: selectedCategory === 'conflicting' ? conflictingLink.trim() : null,
      });

      onSubmit?.({
        category: selectedCategory,
        reason: reason.trim(),
        conflictingLink: selectedCategory === 'conflicting' ? conflictingLink.trim() : undefined,
      });

      reset();

      // Only now, and no longer claiming anything about trust ratings. The
      // response carries a status and a report id; it does not carry a promise
      // that somebody's score will move, and the old wording invented one.
      // Per-subject, because a member who has just reported harassment needs
      // something they can do now, and "a moderator will review this" is not it.
      showAlert({
        type: 'success',
        title: 'Report received',
        message:
          `${CONFIRMATION[contentType] ?? 'Thank you. A moderator will review this.'} `
          + `Your reference is ${report.reportId}.`,
      });

      onClose();
    } catch (cause) {
      // The report stays on screen with the member's text intact, because the
      // alternative is clearing a form they will have to fill in again.
      showAlert({
        type: 'error',
        title: 'Report not sent',
        message: `${communityErrorMessage(cause)} Nothing has been reported — your details are still here, so you can try again.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleCancel}
      title={`Report ${contentType.toLowerCase()}`}
      subtitle={`Reference #${contentId}`}
      testID="report-modal"
      footer={
        <View className="flex-row" style={{ gap: 8 }}>
          <View className="flex-1">
            <Button
              label={isReportable ? 'Cancel' : 'Close'}
              variant="outline"
              onPress={handleCancel}
            />
          </View>
          {/* No submit button when the platform cannot carry the report. A
              disabled one would still say "you could report this if you tried
              harder", which is not what is true. */}
          {isReportable ? (
            <View className="flex-1">
              <Button
                label="Submit report"
                onPress={() => void handleSubmit()}
                isLoading={isSubmitting}
                loadingLabel="Sending…"
              />
            </View>
          ) : null}
        </View>
      }
    >
      {!isReportable ? (
        // Kept, and now unreachable for every subject this modal is given —
        // every member of `ReportSubject` maps to a claimed content type. It
        // stays because the mapping is the thing that decides, and a subject
        // added tomorrow against a type nothing claims must still meet a
        // sentence rather than a form that collects a report nothing receives.
        <View>
          <Text className="text-sm font-bold text-content-primary mb-2">
            Diaspora cannot report this yet
          </Text>
          <Text className="text-xs text-content-secondary leading-relaxed">
            Reporting is not built for this kind of content — there is nowhere for this report to
            go, so we are not going to take your details and lose them.
          </Text>
        </View>
      ) : (
        <>
      <Text className="text-xs font-bold text-content-secondary mb-2">
        {isSubjectReport ? 'What are you reporting?' : 'Category of violation'}
      </Text>

      <View accessibilityRole="radiogroup" className="mb-1" style={{ gap: 8 }}>
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => {
                setSelectedCategory(cat.key);
                setErrors((e) => ({ ...e, category: undefined }));
              }}
              activeOpacity={0.7}
              // These behave as radios but announced as plain views, so a
              // screen reader gave no way to tell which one was chosen.
              accessibilityRole="radio"
              accessibilityLabel={cat.label}
              accessibilityState={{ checked: isSelected, selected: isSelected }}
              style={{ minHeight: 44 }}
              className={`p-3 rounded-xl border flex-row items-center ${
                isSelected ? 'bg-surface-muted border-primary-500' : 'bg-surface-background border-subtle'
              }`}
            >
              <View
                className={`w-4 h-4 rounded-full border items-center justify-center mr-3 ${
                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-line'
                }`}
              >
                {isSelected && <View className="w-1.5 h-1.5 rounded-full bg-surface-card" />}
              </View>
              <Text
                className={`text-xs font-semibold flex-1 ${
                  isSelected ? 'text-primary-600' : 'text-content-secondary'
                }`}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!errors.category && (
        <Text
          className="text-xs text-error-default mb-2"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {errors.category}
        </Text>
      )}

      {selectedCategory === 'conflicting' && (
        <View className="mb-4 mt-3">
          {/* Was `text-content-secondary`, which is not a step in the palette, so the
              class resolved to nothing and the label rendered unstyled. */}
          <Text className="text-xs font-bold text-content-secondary mb-1.5">
            Link to conflicting post *
          </Text>
          <TextInput
            value={conflictingLink}
            onChangeText={(t) => {
              setConflictingLink(t);
              setErrors((e) => ({ ...e, conflictingLink: undefined }));
            }}
            placeholder="e.g. https://diaspora.app/guide/gd-2"
            placeholderTextColor={tokens.color.text.placeholder}
            accessibilityLabel="Link to conflicting post"
            autoCapitalize="none"
            keyboardType="url"
            className="bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs text-content-strong font-semibold"
          />
          {!!errors.conflictingLink && (
            <Text
              className="text-xs text-error-default mt-1"
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {errors.conflictingLink}
            </Text>
          )}
        </View>
      )}

      <View className="mb-2 mt-3">
        <Text className="text-xs font-bold text-content-secondary mb-1.5">Supporting details *</Text>
        <TextInput
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            setErrors((e) => ({ ...e, reason: undefined }));
          }}
          // The prompt has to ask for the thing a moderator will act on, and for
          // a person that is what they did, not what a post says. Asking somebody
          // reporting harassment to explain why it is "incorrect or misleading"
          // is asking the wrong question of the one report that most needs a
          // usable answer.
          placeholder={
            isSubjectReport
              ? 'What happened? Include dates or where it happened if you can…'
              : 'Describe why this content is incorrect, misleading, or inappropriate…'
          }
          placeholderTextColor={tokens.color.text.placeholder}
          accessibilityLabel="Supporting details"
          multiline
          numberOfLines={3}
          style={{ textAlignVertical: 'top' }}
          className="bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs text-content-strong font-semibold min-h-[80px]"
        />
        {!!errors.reason && (
          <Text
            className="text-xs text-error-default mt-1"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {errors.reason}
          </Text>
        )}
      </View>
        </>
      )}
    </Sheet>
  );
}
