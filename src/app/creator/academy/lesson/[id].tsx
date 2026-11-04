// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Lesson viewer (Frontend Phase 7, §12 · §13)
//
// One screen for every lesson in the Academy, present and future. It renders
// `LessonBlock[]` through `<LessonViewer>` and a quiz through `<QuizView>`, and
// it knows the name of no course and no lesson.
//
// The completion rules differ by kind, and the difference matters:
//
//   A reading or checklist lesson completes when the member says it is done.
//   That is a self-report and it is fine — nobody gains anything by lying to
//   their own progress bar.
//
//   A quiz lesson completes when the **server** says it passed. The option type
//   carries no answer key, the grader runs behind `submitQuiz`, and this screen
//   cannot mark the paper even if it wanted to. Completing a quiz lesson
//   through the ordinary "mark done" route is refused server-side with
//   `creator.lesson.quiz_required`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CreatorScreen,
  LessonViewer,
  QuizView,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import { useAcademyActions, useCreatorCourse, useCreatorLesson } from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { FinancialError } from '@/lib/financial-errors';
import type { LessonQuizResult } from '@/types/creator-economy';
import { backOr } from '@/lib/navigation';

export default function LessonViewerScreen() {
  const { tokens } = useTheme();
  // Read by id (`GET /academy/lessons/{lessonId}`) since 20 Oct 2026, so a link
  // carrying only the lesson id resolves in every build. Links written between
  // Remediation Wave C-03 and then carry `?courseId=` as well; it is ignored,
  // because the served lesson names its own course.
  const { id } = useLocalSearchParams<{ id: string }>();

  const lessonQuery = useCreatorLesson(id);
  const lesson = lessonQuery.lesson;

  // Loaded so "next lesson" works without a second navigation to the course.
  const courseQuery = useCreatorCourse(lesson?.courseId);
  const actions = useAcademyActions();

  const [quizResult, setQuizResult] = useState<LessonQuizResult | null>(null);

  useEffect(() => {
    if (lesson) {
      trackCreatorEvent('creator.lesson.viewed', {
        lessonId: lesson.lessonId,
        courseId: lesson.courseId,
        kind: String(lesson.kind),
      });
    }
  }, [lesson?.lessonId]);

  const nextLesson = useMemo(() => {
    if (!lesson) return null;
    const ordered = courseQuery.lessons;
    const index = ordered.findIndex((entry) => entry.lessonId === lesson.lessonId);
    return index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  }, [courseQuery.lessons, lesson]);

  const complete = useCallback(() => {
    if (!lesson) return;

    actions.completeLesson.mutate(lesson.lessonId, {
      onSuccess: (progress) => {
        trackCreatorEvent('creator.lesson.completed', {
          lessonId: lesson.lessonId,
          courseId: lesson.courseId,
        });

        if (progress.state === 'Completed') {
          trackCreatorEvent('creator.course.completed', { courseId: lesson.courseId });
        }

        if (nextLesson) {
          router.replace(
            `/creator/academy/lesson/${nextLesson.lessonId}` as never
          );
        } else {
          backOr();
        }
      },
    });
  }, [actions.completeLesson, lesson, nextLesson]);

  const submitQuiz = useCallback(
    (answers: { questionId: string; optionId: string }[]) => {
      if (!lesson?.quiz) return;

      actions.submitQuiz.mutate(
        { quizId: lesson.quiz.quizId, answers },
        {
          onSuccess: (result) => {
            setQuizResult(result);
            trackCreatorEvent('creator.quiz.submitted', {
              quizId: lesson.quiz!.quizId,
              lessonId: lesson.lessonId,
              passed: result.passed,
              correctCount: result.correctCount,
              totalCount: result.totalCount,
            });
          },
        }
      );
    },
    [actions.submitQuiz, lesson]
  );

  const isQuiz = lesson?.kind === 'quiz' && Boolean(lesson.quiz);
  const isDone = lesson?.isComplete || (isQuiz && quizResult?.passed);

  return (
    <CreatorScreen
      title={lesson?.title ?? 'Lesson'}
      subtitle={
        lesson ? `${String(lesson.kind)} · about ${lesson.estimatedMinutes} minutes` : undefined
      }
      gapKey="academy"
      isEnabled={lessonQuery.isEnabled}
      isLoading={lessonQuery.isLoading}
      error={lessonQuery.error}
      onRetry={lessonQuery.refetch}
      footer={
        lesson && !isQuiz ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isDone
                  ? nextLesson
                    ? 'Go to the next lesson'
                    : 'Back to the course'
                  : nextLesson
                    ? 'Mark this lesson done and go to the next one'
                    : 'Mark this lesson done'
              }
              accessibilityState={{ busy: actions.completeLesson.isPending }}
              disabled={actions.completeLesson.isPending}
              onPress={
                isDone
                  ? () =>
                      nextLesson
                        ? router.replace(
                            `/creator/academy/lesson/${nextLesson.lessonId}` as never
                          )
                        : backOr()
                  : complete
              }
              style={{
                backgroundColor: isDone ? tokens.color.success.default : tokens.color.primary[500],
              }}
              className="rounded-full py-4 items-center flex-row justify-center"
            >
              {isDone ? (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              ) : null}
              <Text className="text-white text-xs font-black uppercase tracking-wider">
                {actions.completeLesson.isPending
                  ? 'Saving…'
                  : isDone
                    ? nextLesson
                      ? 'Next lesson'
                      : 'Back to the course'
                    : nextLesson
                      ? 'Done — next lesson'
                      : 'Mark done'}
              </Text>
            </Pressable>

            {actions.completeLesson.isError ? (
              <View className="mt-2.5">
                <FinancialErrorInline error={actions.completeLesson.error as FinancialError} />
              </View>
            ) : null}
          </>
        ) : isQuiz && quizResult?.passed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextLesson ? 'Go to the next lesson' : 'Back to the course'}
            onPress={() =>
              nextLesson
                ? router.replace(
                    `/creator/academy/lesson/${nextLesson.lessonId}` as never
                  )
                : backOr()
            }
            style={{ backgroundColor: tokens.color.success.solid }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">
              {nextLesson ? 'Next lesson' : 'Back to the course'}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {lesson ? (
        <View className="px-5 pt-4">
          {lesson.isComplete && !isQuiz ? (
            <View
              style={{ backgroundColor: tokens.color.success.surface }}
              className="flex-row items-center rounded-2xl p-3 mb-4"
              accessible
              accessibilityLabel="You have already completed this lesson."
            >
              <Ionicons name="checkmark-circle" size={16} color={tokens.color.success.default} />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-bold ml-2"
              >
                You have already done this one
              </Text>
            </View>
          ) : null}

          <LessonViewer
            blocks={lesson.blocks}
            onAction={(route) => router.push(route as never)}
          />

          {isQuiz && lesson.quiz ? (
            <View className="mt-6">
              <QuizView
                quiz={lesson.quiz}
                result={quizResult}
                isSubmitting={actions.submitQuiz.isPending}
                onSubmit={submitQuiz}
                onRetry={() => setQuizResult(null)}
              />

              {actions.submitQuiz.isError ? (
                <View className="mt-3">
                  <FinancialErrorInline error={actions.submitQuiz.error as FinancialError} />
                </View>
              ) : null}
            </View>
          ) : null}

          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mt-8 leading-relaxed"
          >
            {isQuiz
              ? 'Diaspora marks the quiz. The answers are not in the app.'
              : 'Your progress is saved to your account, not just this device.'}
          </Text>
        </View>
      ) : null}
    </CreatorScreen>
  );
}
