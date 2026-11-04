// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator Academy components (Frontend Phase 7)
//
// §13: "The Academy should be designed as a scalable content platform. Do not
// build every lesson as a one-off screen."
//
// So there are five components here and no lesson-specific code anywhere. A
// lesson is `LessonBlock[]`, `<LessonViewer>` renders the union, and adding a
// hundred lessons to the platform requires no frontend change. The block union
// is deliberately closed and deliberately *not* HTML or markdown: a content
// service that could send markup could send a script, and the way to make that
// impossible is for the renderer to only know how to draw a heading, a
// paragraph, a list, a callout, a checklist, a quote and an action.
//
// The quiz is the other design decision worth stating. `LessonQuizOption`
// carries no `isCorrect`, the grader runs server-side, and the result comes
// back as per-question outcomes. That means the assessment is real even in
// development — and it means the eventual backend implementation is a route
// change rather than a redesign of a component that was marking its own paper.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { clampPercentage } from '@/lib/creator-economy';
import { CreatorCard, useToneColours } from './CreatorPrimitives';
import type {
  CreatorCertificate,
  CreatorCourse,
  CreatorCourseProgress,
  CreatorLesson,
  LessonBlock,
  LessonQuiz,
  LessonQuizResult,
} from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Course
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function CourseCard({
  course,
  onPress,
  onToggleSaved,
  layout = 'list',
}: {
  course: CreatorCourse;
  onPress: (course: CreatorCourse) => void;
  onToggleSaved?: (course: CreatorCourse) => void;
  layout?: 'list' | 'rail';
}) {
  const { tokens } = useTheme();
  const progress = course.progress;
  const isComplete = progress?.state === 'Completed';
  const isInProgress = progress?.state === 'InProgress';

  return (
    <CreatorCard
      onPress={() => onPress(course)}
      accessibilityLabel={[
        course.title,
        course.summary,
        `${LEVEL_LABELS[String(course.level)] ?? course.level}, about ${course.estimatedMinutes} minutes, ${course.lessonCount} lessons.`,
        isComplete
          ? 'Completed.'
          : isInProgress
            ? `${progress?.lessonsCompleted} of ${progress?.lessonCount} lessons done.`
            : 'Not started.',
        course.awardsCertificate ? 'Awards a certificate.' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={layout === 'rail' ? { width: 240, marginRight: 12 } : { marginBottom: 12 }}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
        >
          <Text className="text-xl">{course.icon ?? '📘'}</Text>
        </View>

        <View className="flex-1">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={2}
          >
            {course.title}
          </Text>

          <View className="flex-row items-center mt-1">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold"
            >
              {LEVEL_LABELS[String(course.level)] ?? course.level} · {course.estimatedMinutes} min ·{' '}
              {course.lessonCount} lessons
            </Text>
          </View>
        </View>

        {onToggleSaved ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={course.isSaved ? `Remove ${course.title} from saved` : `Save ${course.title}`}
            accessibilityState={{ selected: course.isSaved }}
            onPress={() => onToggleSaved(course)}
            hitSlop={10}
            className="ml-2"
          >
            <Ionicons
              name={course.isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={course.isSaved ? tokens.color.primary[500] : tokens.color.text.placeholder}
            />
          </Pressable>
        ) : null}
      </View>

      {layout === 'list' ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium mt-2 leading-relaxed"
          numberOfLines={2}
        >
          {course.summary}
        </Text>
      ) : null}

      {progress && progress.state !== 'NotStarted' ? (
        <View className="mt-3">
          <CourseProgressBar progress={progress} title={course.title} />
        </View>
      ) : null}

      <View className="flex-row items-center mt-3">
        {course.awardsCertificate ? (
          <View className="flex-row items-center mr-3">
            <Ionicons name="ribbon-outline" size={12} color={tokens.color.primary[500]} />
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[10px] font-black ml-1"
            >
              Certificate
            </Text>
          </View>
        ) : null}

        {isComplete ? (
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={12} color={tokens.color.success.default} />
            <Text
              style={{ color: tokens.color.success.default }}
              className="text-[10px] font-black ml-1"
            >
              Completed
            </Text>
          </View>
        ) : null}
      </View>

      {course.prerequisiteCourseIds.length > 0 && !progress ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold mt-2 leading-relaxed"
        >
          Best done after {course.prerequisiteCourseIds.length} earlier{' '}
          {course.prerequisiteCourseIds.length === 1 ? 'course' : 'courses'}.
        </Text>
      ) : null}
    </CreatorCard>
  );
}

export function CourseProgressBar({
  progress,
  title,
}: {
  progress: CreatorCourseProgress;
  title: string;
}) {
  const { tokens } = useTheme();
  const percentage = clampPercentage(progress.percentage);
  const isComplete = progress.state === 'Completed';
  const colours = useToneColours(isComplete ? 'success' : 'brand');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}: ${progress.lessonsCompleted} of ${progress.lessonCount} lessons done, ${Math.round(percentage)} percent complete.`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percentage) }}
    >
      <View className="flex-row justify-between items-baseline mb-1.5">
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-bold"
        >
          {progress.lessonsCompleted} of {progress.lessonCount} lessons
        </Text>
        <Text style={{ color: colours.fg }} className="text-[10px] font-black">
          {Math.round(percentage)}%
        </Text>
      </View>

      <View
        style={{ backgroundColor: tokens.color.neutral[200] }}
        className="h-1.5 rounded-full overflow-hidden"
      >
        <View
          style={{ backgroundColor: colours.fg, width: `${percentage}%` }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson
// ─────────────────────────────────────────────────────────────────────────────

const LESSON_ICONS: Record<string, string> = {
  reading: 'document-text-outline',
  video: 'play-circle-outline',
  checklist: 'checkbox-outline',
  quiz: 'help-circle-outline',
};

export function LessonCard({
  lesson,
  index,
  onPress,
  isLocked = false,
}: {
  lesson: CreatorLesson;
  index: number;
  onPress: (lesson: CreatorLesson) => void;
  isLocked?: boolean;
}) {
  const { tokens } = useTheme();
  const colours = useToneColours(lesson.isComplete ? 'success' : 'neutral');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lesson ${index + 1}: ${lesson.title}. ${lesson.kind}, about ${lesson.estimatedMinutes} minutes. ${
        lesson.isComplete ? 'Completed.' : isLocked ? 'Locked.' : 'Not started.'
      }`}
      accessibilityState={{ disabled: isLocked }}
      disabled={isLocked}
      onPress={() => onPress(lesson)}
      style={{ borderBottomColor: tokens.color.border.default, opacity: isLocked ? 0.5 : 1 }}
      className="flex-row items-center border-b py-3.5"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-8 h-8 rounded-full items-center justify-center mr-3"
      >
        {lesson.isComplete ? (
          <Ionicons name="checkmark" size={15} color={colours.fg} />
        ) : (
          <Text style={{ color: colours.fg }} className="text-[11px] font-black">
            {index + 1}
          </Text>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold leading-snug"
          numberOfLines={2}
        >
          {lesson.title}
        </Text>
        <View className="flex-row items-center mt-0.5">
          <Ionicons
            name={(LESSON_ICONS[String(lesson.kind)] ?? 'document-outline') as never}
            size={11}
            color={tokens.color.text.placeholder}
          />
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold ml-1"
          >
            {String(lesson.kind)} · {lesson.estimatedMinutes} min
          </Text>
        </View>
      </View>

      <Ionicons
        name={isLocked ? 'lock-closed-outline' : 'chevron-forward'}
        size={16}
        color={tokens.color.text.placeholder}
      />
    </Pressable>
  );
}

/**
 * The lesson viewer.
 *
 * Renders `LessonBlock[]` and nothing else. Every block type in the union has
 * an arm here, and the `default` arm renders nothing rather than throwing — a
 * content service ahead of the app in the store will send a block type this
 * build has never heard of, and a lesson missing one paragraph is a much better
 * outcome than a lesson that crashes.
 */
export function LessonViewer({
  blocks,
  onAction,
}: {
  blocks: LessonBlock[];
  onAction?: (route: string) => void;
}) {
  return (
    <View>
      {blocks.map((block, index) => (
        <LessonBlockView key={index} block={block} onAction={onAction} />
      ))}
    </View>
  );
}

function LessonBlockView({
  block,
  onAction,
}: {
  block: LessonBlock;
  onAction?: (route: string) => void;
}) {
  const { tokens } = useTheme();

  switch (block.kind) {
    case 'heading':
      return (
        <Text
          accessibilityRole="header"
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black tracking-tight mt-6 mb-2"
        >
          {block.text}
        </Text>
      );

    case 'paragraph':
      return (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[14px] font-medium leading-7 mb-3"
        >
          {block.text}
        </Text>
      );

    case 'list':
      return (
        <View className="mb-3 mt-1">
          {block.items.map((item, index) => (
            <View key={index} className="flex-row mb-2">
              <Text
                style={{ color: tokens.color.primary[500] }}
                className="text-[14px] font-black mr-2.5 leading-7"
              >
                {block.ordered ? `${index + 1}.` : '•'}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[14px] font-medium leading-7 flex-1"
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      );

    case 'callout': {
      const palette =
        block.tone === 'success'
          ? { fg: tokens.color.success.default, bg: tokens.color.success.surface, icon: 'checkmark-circle-outline' }
          : block.tone === 'warning'
            ? { fg: tokens.color.warning.default, bg: tokens.color.warning.surface, icon: 'alert-circle-outline' }
            : { fg: tokens.color.info.default, bg: tokens.color.info.surface, icon: 'information-circle-outline' };

      return (
        <View
          accessible
          accessibilityLabel={`${block.title ? `${block.title}. ` : ''}${block.text}`}
          style={{ backgroundColor: palette.bg, borderColor: `${palette.fg}33` }}
          className="rounded-2xl border p-4 my-3"
        >
          <View className="flex-row items-center mb-1.5">
            <Ionicons name={palette.icon as never} size={15} color={palette.fg} />
            {block.title ? (
              <Text
                style={{ color: palette.fg }}
                className="text-[11px] font-black uppercase tracking-widest ml-1.5"
              >
                {block.title}
              </Text>
            ) : null}
          </View>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-semibold leading-6"
          >
            {block.text}
          </Text>
        </View>
      );
    }

    case 'checklist':
      return (
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="rounded-2xl p-4 my-3"
        >
          {block.items.map((item, index) => (
            <View key={index} className="flex-row items-start mb-2.5 last:mb-0">
              <Ionicons
                name="square-outline"
                size={15}
                color={tokens.color.text.placeholder}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-semibold leading-6 ml-2.5 flex-1"
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View
          style={{ borderLeftColor: tokens.color.primary[500] }}
          className="border-l-2 pl-4 my-4"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[14px] font-semibold italic leading-7"
          >
            {block.text}
          </Text>
          {block.attribution ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-bold mt-1.5"
            >
              — {block.attribution}
            </Text>
          ) : null}
        </View>
      );

    case 'action':
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${block.label}${block.description ? `. ${block.description}` : ''}`}
          onPress={() => onAction?.(block.route)}
          style={{
            backgroundColor: tokens.color.surface.elevated,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border p-4 my-3 flex-row items-center"
        >
          <View className="flex-1 mr-3">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black"
            >
              {block.label}
            </Text>
            {block.description ? (
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-medium mt-0.5 leading-relaxed"
              >
                {block.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="arrow-forward" size={16} color={tokens.color.primary[500]} />
        </Pressable>
      );

    default:
      // A block type this build does not know. Rendering nothing is right:
      // a deployment can be ahead of the app, and a missing paragraph beats a
      // crash. See the doc comment on `LessonViewer`.
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quiz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The quiz.
 *
 * Collects answers and submits them. It cannot mark them — the option type has
 * no answer key — so `result` arrives from the caller after `submitQuiz`
 * resolves, and the per-question marks come from the server's `outcomes`.
 */
export function QuizView({
  quiz,
  result,
  isSubmitting,
  onSubmit,
  onRetry,
}: {
  quiz: LessonQuiz;
  result: LessonQuizResult | null;
  isSubmitting: boolean;
  onSubmit: (answers: { questionId: string; optionId: string }[]) => void;
  onRetry: () => void;
}) {
  const { tokens } = useTheme();
  const [selections, setSelections] = useState<Record<string, string>>({});

  const answered = Object.keys(selections).length;
  const isComplete = answered === quiz.questions.length;

  const outcomeFor = useCallback(
    (questionId: string) => result?.outcomes.find((outcome) => outcome.questionId === questionId),
    [result]
  );

  const submit = useCallback(() => {
    onSubmit(
      Object.entries(selections).map(([questionId, optionId]) => ({ questionId, optionId }))
    );
  }, [onSubmit, selections]);

  const retry = useCallback(() => {
    setSelections({});
    onRetry();
  }, [onRetry]);

  const resultColours = useToneColours(result?.passed ? 'success' : 'warning');

  return (
    <View>
      {result ? (
        <View
          accessible
          accessibilityLabel={`${result.passed ? 'Passed' : 'Not passed'}. ${result.correctCount} of ${result.totalCount} correct.`}
          style={{ backgroundColor: resultColours.bg }}
          className="rounded-2xl p-4 mb-5 flex-row items-center"
        >
          <Ionicons
            name={result.passed ? 'checkmark-circle' : 'refresh-circle'}
            size={26}
            color={resultColours.fg}
          />
          <View className="ml-3 flex-1">
            <Text style={{ color: resultColours.fg }} className="text-sm font-black">
              {result.passed ? 'Passed' : 'Not quite'}
            </Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-semibold mt-0.5"
            >
              {result.correctCount} of {result.totalCount} correct
              {result.passed ? '. This lesson is complete.' : `. You need ${quiz.passMark} to pass.`}
            </Text>
          </View>
        </View>
      ) : null}

      {quiz.questions.map((question, questionIndex) => {
        const outcome = outcomeFor(question.questionId);

        return (
          <View key={question.questionId} className="mb-6">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[14px] font-black leading-6 mb-3"
            >
              {questionIndex + 1}. {question.prompt}
            </Text>

            {question.options.map((option) => {
              const isSelected = selections[question.questionId] === option.optionId;
              const showMark = Boolean(outcome && isSelected);
              const isRight = showMark && outcome?.isCorrect;

              return (
                <Pressable
                  key={option.optionId}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: Boolean(result) }}
                  accessibilityLabel={
                    showMark
                      ? `${option.label}. Your answer. ${isRight ? 'Correct.' : 'Not correct.'}`
                      : option.label
                  }
                  disabled={Boolean(result)}
                  onPress={() =>
                    setSelections((current) => ({ ...current, [question.questionId]: option.optionId }))
                  }
                  style={{
                    backgroundColor: isSelected
                      ? showMark
                        ? isRight
                          ? tokens.color.success.surface
                          : tokens.color.error.surface
                        : tokens.color.neutral[100]
                      : tokens.color.surface.card,
                    borderColor: isSelected
                      ? showMark
                        ? isRight
                          ? tokens.color.success.default
                          : tokens.color.error.default
                        : tokens.color.primary[500]
                      : tokens.color.border.default,
                  }}
                  className="rounded-2xl border p-3.5 mb-2 flex-row items-center"
                >
                  <View
                    style={{
                      borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                      backgroundColor: isSelected ? tokens.color.primary[500] : 'transparent',
                    }}
                    className="w-4 h-4 rounded-full border-2 items-center justify-center mr-3"
                  >
                    {isSelected ? <View className="w-1.5 h-1.5 rounded-full bg-surface-card" /> : null}
                  </View>

                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-semibold flex-1 leading-5"
                  >
                    {option.label}
                  </Text>

                  {showMark ? (
                    <Ionicons
                      name={isRight ? 'checkmark-circle' : 'close-circle'}
                      size={17}
                      color={isRight ? tokens.color.success.default : tokens.color.error.default}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            {outcome?.explanation ? (
              <View
                style={{ backgroundColor: tokens.color.surface.elevated }}
                className="rounded-xl p-3 mt-1.5"
              >
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold leading-relaxed"
                >
                  {outcome.explanation}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {result ? (
        result.canRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try the quiz again"
            onPress={retry}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">Try again</Text>
          </Pressable>
        ) : null
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isComplete
              ? 'Submit your answers'
              : `Answer all ${quiz.questions.length} questions before submitting. ${answered} answered so far.`
          }
          accessibilityState={{ disabled: !isComplete || isSubmitting, busy: isSubmitting }}
          disabled={!isComplete || isSubmitting}
          onPress={submit}
          style={{
            backgroundColor: isComplete ? tokens.color.primary[500] : tokens.color.neutral[200],
          }}
          className="rounded-full py-4 items-center"
        >
          <Text
            style={{ color: isComplete ? '#FFFFFF' : tokens.color.text.disabled }}
            className="text-xs font-black uppercase tracking-wider"
          >
            {isSubmitting ? 'Checking…' : `Submit (${answered}/${quiz.questions.length})`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Certificate
// ─────────────────────────────────────────────────────────────────────────────

export function CertificateCard({ certificate }: { certificate: CreatorCertificate }) {
  const { tokens } = useTheme();
  const issued = useMemo(
    () => new Date(certificate.issuedAt).toLocaleDateString(undefined, { dateStyle: 'long' }),
    [certificate.issuedAt]
  );

  return (
    <View
      accessible
      accessibilityLabel={`Certificate for ${certificate.courseTitle}, issued to ${certificate.recipientName} on ${issued}. Reference ${certificate.verificationReference}.`}
      style={{
        backgroundColor: tokens.color.secondary[500],
      }}
      className="rounded-3xl p-5 mb-3"
    >
      <View className="flex-row items-center mb-4">
        <Ionicons name="ribbon" size={20} color="#FFFFFF" />
        <Text className="text-white/75 text-[10px] font-black uppercase tracking-widest ml-2">
          Certificate of completion
        </Text>
      </View>

      <Text className="text-white text-lg font-black tracking-tight leading-6">
        {certificate.courseTitle}
      </Text>

      <Text className="text-white/80 text-xs font-semibold mt-2">
        {certificate.recipientName}
      </Text>

      <View className="flex-row items-end justify-between mt-5 pt-4 border-t border-white/20">
        <View>
          <Text className="text-white/60 text-[9px] font-black uppercase tracking-widest mb-0.5">
            Issued
          </Text>
          <Text className="text-white text-[11px] font-bold">{issued}</Text>
        </View>
        <View className="items-end">
          <Text className="text-white/60 text-[9px] font-black uppercase tracking-widest mb-0.5">
            Reference
          </Text>
          <Text
            className="text-white text-[11px] font-bold"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {certificate.verificationReference}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A small badge for a course-awarded achievement. Used on the profile. */
export function EducationBadge({
  label,
  icon = '🎓',
  isEarned,
}: {
  label: string;
  icon?: string;
  isEarned: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${isEarned ? 'Earned.' : 'Not earned yet.'}`}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        opacity: isEarned ? 1 : 0.45,
      }}
      className="rounded-2xl border p-3 items-center w-[104px] mr-2.5"
    >
      <Text className="text-2xl mb-1.5">{icon}</Text>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[10px] font-black text-center leading-tight"
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text
        style={{ color: isEarned ? tokens.color.success.default : tokens.color.text.placeholder }}
        className="text-[9px] font-bold mt-1"
      >
        {isEarned ? 'Earned' : 'Locked'}
      </Text>
    </View>
  );
}
