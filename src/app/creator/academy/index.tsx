// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator Academy (Frontend Phase 7, §12 · §13)
//
// §13: "The Academy should be designed as a scalable content platform. Do not
// build every lesson as a one-off screen."
//
// Three screens exist for the whole Academy — this catalogue, a course, and a
// lesson — and none of them knows the name of a single course. Sections,
// courses, lessons and quizzes all arrive as data from
// `CreatorEducationRepository`, whose development arm is a content provider
// that a CMS or a backend content service replaces without touching any of
// this.
//
// "Continue learning" leads the screen because a half-finished course is the
// single most valuable thing this surface can surface — somebody who has
// started is far more likely to finish than somebody browsing is to start.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CertificateCard,
  CourseCard,
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
} from '@/components/creator-economy';
import {
  useAcademyActions,
  useCreatorAcademy,
  useCreatorCertificates,
} from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CreatorCourse } from '@/types/creator-economy';

export default function CreatorAcademyScreen() {
  const { tokens } = useTheme();

  const [section, setSection] = useState<string>('all');
  const [isRefreshing, setRefreshing] = useState(false);

  const academy = useCreatorAcademy(section === 'all' ? undefined : section);
  const certificates = useCreatorCertificates();
  const actions = useAcademyActions();

  useEffect(() => {
    trackCreatorEvent('creator.academy.viewed');
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    academy.refetch();
    setRefreshing(false);
  }, [academy]);

  const openCourse = useCallback((course: CreatorCourse) => {
    trackCreatorEvent('creator.course.viewed', {
      courseId: course.courseId,
      section: course.sectionKey ?? undefined,
      level: String(course.level),
    });
    router.push(`/creator/academy/course/${course.courseId}` as never);
  }, []);

  const toggleSaved = useCallback(
    (course: CreatorCourse) => {
      trackCreatorEvent('creator.course.saved', { courseId: course.courseId });
      actions.setSaved.mutate({ courseId: course.courseId, isSaved: !course.isSaved });
    },
    [actions.setSaved]
  );

  const inProgress = useMemo(
    () => academy.courses.filter((course) => course.progress?.state === 'InProgress'),
    [academy.courses]
  );

  const saved = useMemo(
    () => academy.courses.filter((course) => course.isSaved && course.progress?.state !== 'Completed'),
    [academy.courses]
  );

  const completed = useMemo(
    () => academy.courses.filter((course) => course.progress?.state === 'Completed'),
    [academy.courses]
  );

  /** Courses grouped by the section the platform put them in. */
  const bySection = useMemo(() => {
    if (section !== 'all') return [];
    return academy.sections
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((entry) => ({
        section: entry,
        courses: academy.courses.filter((course) => course.sectionKey === entry.key),
      }))
      .filter((group) => group.courses.length > 0);
  }, [academy.courses, academy.sections, section]);

  return (
    <CreatorScreen
      title="Creator Academy"
      subtitle="How to do this well, from people who already do"
      gapKey="academy"
      gapDetail="The courses, lessons and quizzes come from a development content provider. Diaspora has no content service yet, so nothing here is versioned or persisted beyond this session."
      isEnabled={academy.isEnabled}
      isLoading={academy.isLoading}
      error={academy.error}
      onRetry={academy.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        academy.sections.length > 0 ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderBottomColor: tokens.color.border.default,
            }}
            className="border-b px-5 py-3"
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              {[{ key: 'all', title: 'All', icon: '📚' }, ...academy.sections].map((entry) => {
                const isActive = section === entry.key;
                return (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`${entry.title} courses`}
                    onPress={() => setSection(entry.key)}
                    style={{
                      backgroundColor: isActive
                        ? tokens.color.primary[500]
                        : tokens.color.surface.background,
                      borderColor: isActive
                        ? tokens.color.primary[500]
                        : tokens.color.border.default,
                    }}
                    className="flex-row items-center rounded-full border px-3.5 py-2 mr-2"
                  >
                    {'icon' in entry && entry.icon ? (
                      <Text className="text-[12px] mr-1.5">{entry.icon}</Text>
                    ) : null}
                    <Text
                      style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                      className="text-[11px] font-black"
                    >
                      {entry.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : undefined
      }
    >
      <View className="px-5 pt-5">
        {academy.isLoading ? (
          <CreatorCardSkeleton rows={4} />
        ) : (
          <>
            {/* ── Continue ─────────────────────────────────────────────── */}
            {inProgress.length > 0 ? (
              <CreatorSection title="Continue" subtitle="Pick up where you left off">
                {inProgress.map((course) => (
                  <CourseCard
                    key={course.courseId}
                    course={course}
                    onPress={openCourse}
                    onToggleSaved={toggleSaved}
                  />
                ))}
              </CreatorSection>
            ) : null}

            {/* ── Saved ────────────────────────────────────────────────── */}
            {saved.length > 0 ? (
              <CreatorSection title="Saved" count={saved.length}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 8 }}
                >
                  {saved.map((course) => (
                    <CourseCard
                      key={course.courseId}
                      course={course}
                      onPress={openCourse}
                      layout="rail"
                    />
                  ))}
                </ScrollView>
              </CreatorSection>
            ) : null}

            {/* ── By section ───────────────────────────────────────────── */}
            {section === 'all' ? (
              bySection.length === 0 ? (
                <CreatorEmptyState
                  icon="school-outline"
                  title="No courses yet"
                  body="Diaspora has not published any Academy content."
                />
              ) : (
                bySection.map((group) => (
                  <CreatorSection
                    key={group.section.key}
                    title={`${group.section.icon ?? ''} ${group.section.title}`.trim()}
                    subtitle={group.section.description ?? undefined}
                  >
                    {group.courses.map((course) => (
                      <CourseCard
                        key={course.courseId}
                        course={course}
                        onPress={openCourse}
                        onToggleSaved={toggleSaved}
                      />
                    ))}
                  </CreatorSection>
                ))
              )
            ) : academy.courses.length === 0 ? (
              <CreatorEmptyState
                icon="school-outline"
                title="Nothing in this section"
                body="Diaspora has not published courses here yet."
                actionLabel="Show everything"
                onAction={() => setSection('all')}
              />
            ) : (
              <CreatorSection
                title={academy.sections.find((entry) => entry.key === section)?.title ?? 'Courses'}
              >
                {academy.courses.map((course) => (
                  <CourseCard
                    key={course.courseId}
                    course={course}
                    onPress={openCourse}
                    onToggleSaved={toggleSaved}
                  />
                ))}
              </CreatorSection>
            )}

            {/* ── Certificates ─────────────────────────────────────────── */}
            {certificates.certificates.length > 0 ? (
              <CreatorSection
                title="Your certificates"
                count={certificates.certificates.length}
                subtitle="Each one carries a reference somebody else can check"
              >
                {certificates.certificates.map((certificate) => (
                  <Pressable
                    key={certificate.certificateId}
                    accessibilityRole="button"
                    accessibilityLabel={`Certificate for ${certificate.courseTitle}`}
                    onPress={() =>
                      trackCreatorEvent('creator.certificate.viewed', {
                        courseId: certificate.courseId,
                      })
                    }
                  >
                    <CertificateCard certificate={certificate} />
                  </Pressable>
                ))}
              </CreatorSection>
            ) : null}

            {/* ── Completed ────────────────────────────────────────────── */}
            {completed.length > 0 && section === 'all' ? (
              <CreatorSection title="Finished" count={completed.length}>
                <View
                  style={{
                    backgroundColor: tokens.color.success.surface,
                  }}
                  className="rounded-2xl p-4 flex-row items-center"
                  accessible
                  accessibilityLabel={`You have finished ${completed.length} ${completed.length === 1 ? 'course' : 'courses'}.`}
                >
                  <Ionicons
                    name="checkmark-done-circle"
                    size={22}
                    color={tokens.color.success.default}
                  />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-bold ml-2.5 flex-1"
                  >
                    {completed.length} {completed.length === 1 ? 'course' : 'courses'} finished
                  </Text>
                </View>
              </CreatorSection>
            ) : null}
          </>
        )}
      </View>
    </CreatorScreen>
  );
}
