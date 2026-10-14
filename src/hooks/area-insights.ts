// What members say about the area around a point (14 Oct 2026).
// See `lib/area-insights-api.ts`.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAreaInsights,
  submitAreaInsight,
  type AreaInsight,
  type SubmitAreaInsightInput,
} from '@/lib/area-insights-api';

const areaInsightKeys = {
  all: ['housing', 'area-insights'] as const,
  around: (latitude: number, longitude: number, radiusKm: number) =>
    ['housing', 'area-insights', latitude.toFixed(5), longitude.toFixed(5), radiusKm] as const,
};

export function useAreaInsights(
  point: { latitude: number; longitude: number } | null,
  radiusKm: number
) {
  const hasPoint = Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  return useQuery<AreaInsight[], Error>({
    queryKey: hasPoint
      ? areaInsightKeys.around(point!.latitude, point!.longitude, radiusKm)
      : [...areaInsightKeys.all, 'none'],
    queryFn: ({ signal }) =>
      fetchAreaInsights({ latitude: point!.latitude, longitude: point!.longitude, radiusKm }, { signal }),
    enabled: hasPoint,
    staleTime: 60_000,
    retry: 0,
  });
}

export function useSubmitAreaInsight() {
  const queryClient = useQueryClient();

  return useMutation<AreaInsight, Error, SubmitAreaInsightInput>({
    mutationFn: submitAreaInsight,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: areaInsightKeys.all });
    },
  });
}
