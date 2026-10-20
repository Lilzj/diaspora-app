// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Course detail (Frontend Phase 7, §12 · §13)
//
// A course is its lesson list plus its progress. Both come from the repository
// and neither is computed here — in particular `progress.percentage` is served,
// so a course whose lessons are weighted differently reports the weighting the
// platform applies rather than a lesson count.
//
// Lessons unlock in order. That is a *presentation* decision made here rather
// than a rule the server enforces, and it is marked as one: the lock is
// advisory, `LessonCard` renders it as such, and a lesson opened directly by
// deep link still works. A hard sequence rule would need a contract, and the
// register does not claim one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CourseProgressBar,
  CreatorCard,
  CreatorScreen,
  CreatorSection,
  LessonCard,
} from '@/components/creator-economy';
import { useAcademyActions, useCreatorAcademy, useCreatorCourse } from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorLesson } from '@/types/creator-economy';

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export default function CourseDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useCreatorCourse(id);
  const academy = useCreatorAcademy();
  const actions = useAcademyActions();

  const course = query.course;
  const lessons = query.lessons;

  useEffect(() => {
    if (course) {
      trackCreatorEvent('creator.course.viewed', {
        courseId: course.courseId,
        level: String(course.level),
      });
    }
  }, [course?.courseId]);

  /**
   * The first incomplete lesson. Everything after it is shown locked.
   *
   * Advisory only — see the file header. Somebody who wants to skip ahead can,
   * and the deep link into a lesson does not consult this.
   */
  const firstIncompleteIndex = useMemo(
    () => lessons.findIndex((lesson) => !lesson.isComplete),
    [lessons]
  );

  const prerequisites = useMemo(() => {
    if (!course || course.prerequisiteCourseIds.length === 0) return [];
    return academy.courses.filter((entry) =>
      course.prerequisiteCourseIds.includes(entry.courseId)
    );
  }, [academy.courses, course]);

  const unmetPrerequisites = prerequisites.filter(
    (entry) => entry.progress?.state !== 'Completed'
  );

  const openLesson = useCallback(
    (lesson: CreatorLesson) => {
      trackCreatorEvent('creator.lesson.viewed', {
        lessonId: lesson.lessonId,
        courseId: lesson.courseId,
        kind: String(lesson.kind),
      });
      // The lesson is read by its own id (`GET /academy/lessons/{lessonId}`).
      router.push(`/creator/academy/lesson/${lesson.lessonId}` as never);
    },
    []
  );

  const startOrContinue = useCallback(() => {
    if (!course) return;
    const target =
      lessons.find((lesson) => lesson.lessonId === course.progress?.nextLessonId) ??
      lessons.find((lesson) => !lesson.isComplete) ??
      lessons[0];
    if (!target) return;

    if (!course.progress || course.progress.state === 'NotStarted') {
      trackCreatorEvent('creator.course.started', { courseId: course.courseId });
    }
    openLesson(target);
  }, [course, lessons, openLesson]);

  const isComplete = course?.progress?.state === 'Completed';

  return (
    <CreatorScreen
      title={course?.title ?? 'Course'}
      subtitle={course ? LEVEL_LABELS[String(course.level)] ?? String(course.level) : undefined}
      gapKey="academy"
      isEnabled={query.isEnabled}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      headerRight={
        course ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={course.isSaved ? 'Remove from saved' : 'Save this course'}
            accessibilityState={{ selected: course.isSaved }}
            onPress={() =>
              actions.setSaved.mutate({ courseId: course.courseId, isSaved: !course.isSaved })
            }
            hitSlop={8}
            className="w-11 h-11 items-center justify-center"
          >
            <Ionicons
              name={course.isSaved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={course.isSaved ? tokens.color.primary[500] : tokens.color.text.primary}
            />
          </Pressable>
        ) : undefined
      }
      footer={
        course && lessons.length > 0 && !isComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              course.progress?.state === 'InProgress'
                ? 'Continue this course'
                : 'Start this course'
            }
            onPress={startOrContinue}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">
              {course.progress?.state === 'InProgress' ? 'Continue' : 'Start'}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {course ? (
        <View className="px-5 pt-5">
          {/* ── Overview ─────────────────────────────────────────────────── */}
          <CreatorCard style={{ marginBottom: 20 }}>
            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: tokens.color.surface.elevated }}
                className="w-12 h-12 rounded-2xl items-center justify-center mr-3"
              >
                <Text className="text-2xl">{course.icon ?? '📘'}</Text>
              </View>

              <View className="flex-1">
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[13px] font-medium leading-relaxed"
                >
                  {course.summary}
                </Text>

                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-bold mt-2"
                >
                  {LEVEL_LABELS[String(course.level)] ?? course.level} · about{' '}
                  {course.estimatedMinutes} minutes · {course.lessonCount} lessons
                </Text>
              </View>
            </View>

            {course.progress && course.progress.state !== 'NotStarted' ? (
              <View className="mt-4">
                <CourseProgressBar progress={course.progress} title={course.title} />
              </View>
            ) : null}

            {course.awardsCertificate ? (
              <View
                style={{ backgroundColor: tokens.color.primary[50] }}
                className="flex-row items-center rounded-xl p-3 mt-4"
              >
                <Ionicons name="ribbon-outline" size={15} color={tokens.color.primary[600]} />
                <Text
                  style={{ color: tokens.color.primary[600] }}
                  className="text-[11px] font-bold ml-2 flex-1"
                >
                  Finishing this issues a certificate with a reference others can check.
                </Text>
              </View>
            ) : null}
          </CreatorCard>

          {/* ── Prerequisites ────────────────────────────────────────────── */}
          {unmetPrerequisites.length > 0 ? (
            <CreatorSection
              title="Best done after"
              subtitle="Not a rule — you can start this whenever you like"
            >
              <CreatorCard padded={false}>
                {unmetPrerequisites.map((entry, index) => (
                  <Pressable
                    key={entry.courseId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${entry.title}`}
                    onPress={() => router.push(`/creator/academy/course/${entry.courseId}` as never)}
                    style={{
                      borderBottomColor: tokens.color.border.default,
                      borderBottomWidth: index === unmetPrerequisites.length - 1 ? 0 : 1,
                    }}
                    className="flex-row items-center px-4 py-3.5"
                  >
                    <Text className="text-base mr-3">{entry.icon ?? '📘'}</Text>
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-bold flex-1"
                      numberOfLines={1}
                    >
                      {entry.title}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={tokens.color.text.placeholder}
                    />
                  </Pressable>
                ))}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Lessons ──────────────────────────────────────────────────── */}
          <CreatorSection
            title="Lessons"
            subtitle={
              course.progress
                ? `${course.progress.lessonsCompleted} of ${course.progress.lessonCount} done`
                : undefined
            }
          >
            <CreatorCard padded={false}>
              <View className="px-4">
                {lessons.map((lesson, index) => (
                  <LessonCard
                    key={lesson.lessonId}
                    lesson={lesson}
                    index={index}
                    onPress={openLesson}
                    isLocked={
                      firstIncompleteIndex >= 0 && index > firstIncompleteIndex && !lesson.isComplete
                    }
                  />
                ))}
              </View>
            </CreatorCard>
          </CreatorSection>

          {/* ── Done ─────────────────────────────────────────────────────── */}
          {isComplete ? (
            <View
              style={{ backgroundColor: tokens.color.success.surface }}
              className="rounded-2xl p-4 mb-5 flex-row items-center"
              accessible
              accessibilityLabel="You have finished this course."
            >
              <Ionicons name="checkmark-done-circle" size={22} color={tokens.color.success.default} />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-bold ml-2.5 flex-1"
              >
                Finished. {course.awardsCertificate ? 'Your certificate is in the Academy.' : ''}
              </Text>
            </View>
          ) : null}

          {course.tags.length > 0 ? (
            <View className="flex-row flex-wrap mb-6">
              {course.tags.map((tag) => (
                <View
                  key={tag}
                  style={{ backgroundColor: tokens.color.surface.elevated }}
                  className="rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
                >
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold"
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </CreatorScreen>
  );
}
