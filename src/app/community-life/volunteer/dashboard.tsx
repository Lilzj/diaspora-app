// ─────────────────────────────────────────────────────────────────────────────
// Volunteer dashboard (§20)
//
// My applications, upcoming assignments, hours, completed opportunities,
// certificates, skills and history.
//
// The hours figure is `Sourced` and marked simulated, and the screen says why:
// §34 forbids inventing an impact metric, and an hour nobody confirmed is not a
// fact about the world. Only organizer-confirmed hours count towards it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusBadge,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  Section,
  SimulatedFigure,
  Stat,
  readableDate,
} from '@/components/community';
import {
  useMyAssignments,
  useMyVolunteerApplications,
  useVolunteerHours,
} from '@/hooks/community-life';
import { describeVolunteerApplication, describeVolunteerAssignment } from '@/lib/community-state';

type Tab = 'applications' | 'assignments' | 'impact';

export default function VolunteerDashboardScreen() {
  const { tokens } = useTheme();
  const [tab, setTab] = useState<Tab>('applications');

  const { data: applications, isLoading, isError, error, refetch } =
    useMyVolunteerApplications();
  const { data: assignments } = useMyAssignments();
  const { summary } = useVolunteerHours();

  const grouped = useMemo(
    () => ({
      live: applications.filter((a) =>
        ['Pending', 'Waitlisted', 'Approved', 'Draft'].includes(a.status)
      ),
      past: applications.filter((a) =>
        ['Rejected', 'Withdrawn', 'Cancelled', 'Completed'].includes(a.status)
      ),
      upcoming: assignments.filter((a) =>
        ['Assigned', 'Confirmed', 'CheckedIn'].includes(a.status)
      ),
      done: assignments.filter((a) => ['Completed', 'NoShow', 'Cancelled'].includes(a.status)),
    }),
    [applications, assignments]
  );

  return (
    <CommunityScreen
      title="My volunteering"
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Dashboard sections"
          options={[
            { value: 'applications' as const, label: `Applications (${grouped.live.length})` },
            { value: 'assignments' as const, label: `Shifts (${grouped.upcoming.length})` },
            { value: 'impact' as const, label: 'My impact' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {/* ── Applications ──────────────────────────────────────────────────── */}
      {tab === 'applications' ? (
        <View className="px-5 mt-4">
          {applications.length === 0 ? (
            <EmptyState
              icon="hand-left-outline"
              title="No applications yet"
              body="When you apply to volunteer, you can follow the decision here."
              action="Find something to help with"
              onAction={() => router.push('/community-life/volunteer')}
            />
          ) : (
            <>
              {grouped.live.length > 0 ? (
                <>
                  <Text
                    accessibilityRole="header"
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight mb-2.5"
                  >
                    In progress
                  </Text>
                  {grouped.live.map((application) => (
                    <View key={application.applicationId} className="mb-2.5">
                      <Card
                        onPress={() =>
                          router.push(
                            `/community-life/volunteer/${application.opportunityId}` as never
                          )
                        }
                        accessibilityLabel={`${application.opportunityTitle}, with ${application.organizationName}. ${describeVolunteerApplication(application.status).label}.${
                          application.waitlistPosition
                            ? ` Number ${application.waitlistPosition} on the list.`
                            : ''
                        }`}
                        accessibilityHint="Opens the opportunity"
                      >
                        <View className="flex-row items-start">
                          <View className="flex-1 pr-3">
                            <Text
                              style={{ color: tokens.color.text.primary }}
                              className="text-xs font-black tracking-tight"
                              numberOfLines={2}
                            >
                              {application.opportunityTitle}
                            </Text>
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[11px] font-bold mt-0.5"
                            >
                              {application.organizationName}
                              {application.submittedAt
                                ? ` · sent ${readableDate(application.submittedAt)}`
                                : ''}
                            </Text>
                            {application.decisionReason ? (
                              <Text
                                style={{ color: tokens.color.text.secondary }}
                                className="text-[11px] font-semibold mt-1.5 leading-relaxed"
                              >
                                {application.decisionReason}
                              </Text>
                            ) : null}
                          </View>
                          <CommunityStatusBadge
                            state={describeVolunteerApplication(application.status)}
                            size="small"
                          />
                        </View>
                      </Card>
                    </View>
                  ))}
                </>
              ) : null}

              {grouped.past.length > 0 ? (
                <Section title="Past applications" style={{ marginHorizontal: -20 }}>
                  <View className="px-5">
                    {grouped.past.map((application) => (
                      <View key={application.applicationId} className="mb-2.5">
                        <Card>
                          <View className="flex-row items-center">
                            <View className="flex-1 pr-3">
                              <Text
                                style={{ color: tokens.color.text.primary }}
                                className="text-xs font-bold"
                                numberOfLines={1}
                              >
                                {application.opportunityTitle}
                              </Text>
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[11px] font-semibold mt-0.5"
                              >
                                {application.organizationName}
                              </Text>
                            </View>
                            <CommunityStatusBadge
                              state={describeVolunteerApplication(application.status)}
                              size="small"
                            />
                          </View>
                        </Card>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* ── Assignments ───────────────────────────────────────────────────── */}
      {tab === 'assignments' ? (
        <View className="px-5 mt-4">
          {assignments.length === 0 ? (
            <EmptyState
              icon="clipboard-outline"
              title="No shifts yet"
              body="Once an organiser approves you and puts you on a shift, it will show up here."
            />
          ) : (
            <>
              {grouped.upcoming.length > 0 ? (
                <>
                  <Text
                    accessibilityRole="header"
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight mb-2.5"
                  >
                    Coming up
                  </Text>
                  {grouped.upcoming.map((assignment) => (
                    <View key={assignment.assignmentId} className="mb-2.5">
                      <Card
                        accessibilityLabel={`${assignment.opportunityTitle}, ${assignment.shiftLabel ?? 'shift'}, ${readableDate(assignment.date)}, ${assignment.startTime} to ${assignment.endTime}. ${describeVolunteerAssignment(assignment.status).label}.`}
                      >
                        <View className="flex-row items-start">
                          <View
                            style={{ backgroundColor: tokens.color.surface.elevated }}
                            className="w-12 items-center rounded-xl py-2"
                          >
                            <Text
                              style={{ color: tokens.color.text.primary }}
                              className="text-base font-black tracking-tight"
                            >
                              {assignment.date.slice(8, 10)}
                            </Text>
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[9px] font-black uppercase tracking-widest"
                            >
                              {new Date(`${assignment.date}T00:00:00`).toLocaleDateString(undefined, {
                                month: 'short',
                              })}
                            </Text>
                          </View>

                          <View className="flex-1 ml-3">
                            <Text
                              style={{ color: tokens.color.text.primary }}
                              className="text-xs font-black tracking-tight"
                              numberOfLines={2}
                            >
                              {assignment.opportunityTitle}
                            </Text>
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[11px] font-bold mt-0.5"
                            >
                              {assignment.shiftLabel ?? 'Shift'} · {assignment.startTime}–
                              {assignment.endTime}
                            </Text>
                            <View className="flex-row items-center mt-1">
                              <Ionicons
                                name="location-outline"
                                size={11}
                                color={tokens.color.text.placeholder}
                              />
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[10px] font-semibold ml-0.5"
                                numberOfLines={1}
                              >
                                {assignment.location.areaName}, {assignment.location.cityName}
                              </Text>
                            </View>
                            <View className="mt-2">
                              <CommunityStatusBadge
                                state={describeVolunteerAssignment(assignment.status)}
                                size="small"
                              />
                            </View>
                          </View>
                        </View>
                      </Card>
                    </View>
                  ))}
                </>
              ) : null}

              {grouped.done.length > 0 ? (
                <Section title="Completed" style={{ marginHorizontal: -20 }}>
                  <View className="px-5">
                    {grouped.done.map((assignment) => (
                      <View key={assignment.assignmentId} className="mb-2.5">
                        <Card>
                          <View className="flex-row items-center">
                            <View className="flex-1 pr-3">
                              <Text
                                style={{ color: tokens.color.text.primary }}
                                className="text-xs font-bold"
                                numberOfLines={1}
                              >
                                {assignment.opportunityTitle}
                              </Text>
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[11px] font-semibold mt-0.5"
                              >
                                {readableDate(assignment.date)}
                                {assignment.confirmedHours
                                  ? ` · ${assignment.confirmedHours} hours confirmed`
                                  : ' · hours not confirmed'}
                              </Text>
                            </View>
                            <CommunityStatusBadge
                              state={describeVolunteerAssignment(assignment.status)}
                              size="small"
                            />
                          </View>
                        </Card>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* ── Impact ────────────────────────────────────────────────────────── */}
      {tab === 'impact' ? (
        <View className="px-5 mt-4">
          {summary ? (
            <>
              <View className="flex-row" style={{ gap: 10 }}>
                <Stat
                  label="Hours confirmed"
                  value={summary.confirmedHours}
                  icon="time-outline"
                />
                <Stat
                  label="Completed"
                  value={summary.completedOpportunities}
                  icon="checkmark-done-outline"
                />
                <Stat
                  label="Organisations"
                  value={summary.organizationsSupported}
                  icon="business-outline"
                />
              </View>

              <View className="mt-4">
                <InlineRefusal
                  icon="information-circle-outline"
                  reason="Only hours an organiser has confirmed are counted. Diaspora does not add up hours you have told it about yourself — a number nobody stands behind is not worth showing."
                />
              </View>

              {summary.skills.length > 0 ? (
                <Section title="Skills you have used" style={{ marginHorizontal: -20 }}>
                  <View className="px-5 flex-row flex-wrap">
                    {summary.skills.map((skill) => (
                      <View
                        key={skill}
                        style={{ backgroundColor: tokens.color.neutral[100] }}
                        className="rounded-full px-3 py-1.5 mr-2 mb-2"
                      >
                        <Text
                          style={{ color: tokens.color.secondary[600] }}
                          className="text-[11px] font-bold"
                        >
                          {skill}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}

              {summary.certificates.length > 0 ? (
                <Section title="Certificates" style={{ marginHorizontal: -20 }}>
                  <View className="px-5">
                    {summary.certificates.map((certificate) => (
                      <View key={certificate.certificateId} className="mb-2.5">
                        <Card>
                          <View className="flex-row items-center">
                            <View
                              style={{ backgroundColor: tokens.color.neutral[100] }}
                              className="w-10 h-10 rounded-xl items-center justify-center"
                            >
                              <Ionicons
                                name="ribbon-outline"
                                size={18}
                                color={tokens.color.primary[600]}
                              />
                            </View>
                            <View className="flex-1 ml-3">
                              <Text
                                style={{ color: tokens.color.text.primary }}
                                className="text-xs font-black tracking-tight"
                                numberOfLines={2}
                              >
                                {certificate.title}
                              </Text>
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[11px] font-bold mt-0.5"
                              >
                                {certificate.organizationName} · {certificate.hours} hours ·{' '}
                                {readableDate(certificate.issuedAt)}
                              </Text>
                            </View>
                          </View>
                          {!certificate.downloadUrl ? (
                            <View className="mt-2.5">
                              <SimulatedFigure label="Not downloadable yet" />
                            </View>
                          ) : null}
                        </Card>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="sparkles-outline"
              title="Nothing to show yet"
              body="Complete a shift and your hours will appear here once the organiser confirms them."
            />
          )}
        </View>
      ) : null}

      <View className="px-5 mt-8">
        <PrimaryButton
          label="Find something to help with"
          icon="search-outline"
          onPress={() => router.push('/community-life/volunteer')}
        />
      </View>
    </CommunityScreen>
  );
}
