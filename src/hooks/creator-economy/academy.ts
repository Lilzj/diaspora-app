// Creator economy hooks: academy. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { useAuthStore } from '@/store/auth';
import { REFERENCE_STALE_MS, mutationOptions, readOptions } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// CreatorEducationRepository — CREATOR-GAP-006
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The Academy.
 *
 * Sections and courses in one hook because the home screen needs both to draw a
 * single list, and two hooks would produce two spinners for one screenful.
 */
export function useCreatorAcademy(section?: string) {
  const sectionsQuery = useQuery({
    queryKey: creatorGapKeys.academySections(),
    queryFn: certifiedApi.fetchAcademySections,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  const coursesQuery = useQuery({
    queryKey: creatorGapKeys.courses(section),
    queryFn: () => certifiedApi.fetchCourses({ section }),
    // Not `REFERENCE_STALE_MS`: the catalogue is stable but the *progress*
    // folded into each course is not, and stale progress on a "Continue" button
    // sends somebody to a lesson they already finished.
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    sections: sectionsQuery.data ?? [],
    courses: coursesQuery.data ?? [],
    isLoading: sectionsQuery.isLoading || coursesQuery.isLoading,
    isError: sectionsQuery.isError || coursesQuery.isError,
    error: ((sectionsQuery.error ?? coursesQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void sectionsQuery.refetch();
      void coursesQuery.refetch();
    },
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCreatorCourse(courseId: string | undefined) {
  const courseQuery = useQuery({
    queryKey: creatorGapKeys.course(courseId ?? 'none'),
    queryFn: () => certifiedApi.fetchCourse(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  const lessonsQuery = useQuery({
    queryKey: creatorGapKeys.lessons(courseId ?? 'none'),
    queryFn: () => certifiedApi.fetchCourseLessons(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    course: courseQuery.data ?? null,
    lessons: lessonsQuery.data ?? [],
    isLoading: courseQuery.isLoading || lessonsQuery.isLoading,
    isError: courseQuery.isError || lessonsQuery.isError,
    error: ((courseQuery.error ?? lessonsQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void courseQuery.refetch();
      void lessonsQuery.refetch();
    },
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * One lesson — `GET /academy/lessons/{lessonId}`, in every build since
 * 20 Oct 2026.
 *
 * Until then a lesson was only addressable through its course's list, so the
 * screen needed `courseId` in its URL and a legacy deep link without one fell
 * back to the simulated arm (and to "not available" in a release build). The
 * served lesson carries its own `courseId`, so any link with a lesson id now
 * resolves.
 */
export function useCreatorLesson(lessonId: string | undefined) {
  const query = useQuery({
    queryKey: creatorGapKeys.lesson(lessonId ?? 'none'),
    queryFn: () => certifiedApi.fetchLesson(lessonId!),
    enabled: Boolean(lessonId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  return {
    lesson: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useAcademyActions() {
  const queryClient = useQueryClient();

  const invalidateAcademy = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: creatorGapKeys.academyAll() });
    void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
  }, [queryClient]);

  const completeLesson = useMutation({
    ...mutationOptions,
    mutationFn: async (lessonId: string) => {
      const scope: OperationScope = { operation: 'lesson-complete', subject: lessonId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const progress = await certifiedApi.completeLesson(lessonId, idempotencyKey);
      await releaseIdempotencyKey(scope);
      return progress;
    },
    onSuccess: (progress) => {
      invalidateAcademy();
      // Finishing a course can complete a milestone and issue a certificate.
      if (progress.state === 'Completed') {
        void queryClient.invalidateQueries({ queryKey: creatorGapKeys.milestones() });
        void queryClient.invalidateQueries({ queryKey: creatorGapKeys.certificates() });
      }
    },
  });

  const submitQuiz = useMutation({
    ...mutationOptions,
    mutationFn: ({
      quizId,
      answers,
    }: {
      quizId: string;
      answers: { questionId: string; optionId: string }[];
    }) => certifiedApi.submitQuiz(quizId, answers),
    onSuccess: (result) => {
      if (result.passed) invalidateAcademy();
    },
  });

  const setSaved = useMutation({
    ...mutationOptions,
    mutationFn: ({ courseId, isSaved }: { courseId: string; isSaved: boolean }) =>
      certifiedApi.setCourseSaved(courseId, isSaved),
    onSuccess: (course) => {
      queryClient.setQueryData(creatorGapKeys.course(course.courseId), course);
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.academyCourses() });
    },
  });

  return { completeLesson, submitQuiz, setSaved };
}

export function useCreatorCertificates() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: creatorGapKeys.certificates(),
    queryFn: certifiedApi.fetchCertificates,
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    certificates: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: true,
  };
}
