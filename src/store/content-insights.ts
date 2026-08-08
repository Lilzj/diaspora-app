import { create } from 'zustand';
import { CreatorAnalyticsData } from '@/types/creator';

const mockAnalyticsMap: Record<'7d' | '30d' | '90d' | 'all', CreatorAnalyticsData> = {
  '7d': {
    timeFilter: '7d',
    views: 320,
    reach: 680,
    followers: 15,
    messages: 18,
    conversion: '86%',
    helpfulVotes: 89,
    reputationPoints: 120,
    trustScore: 92,
    growthTrend: '↑ 12%',
    viewsTrafficPath: 'M0,70 Q40,45 80,60 T160,35 T240,55 T320,25',
    updatesTrafficPath: 'M0,85 Q40,70 80,75 T160,55 T240,65 T320,40',
    followersTrafficPath: 'M0,95 Q40,85 80,88 T160,78 T240,82 T320,65',
  },
  '30d': {
    timeFilter: '30d',
    views: 1450,
    reach: 3820,
    followers: 120,
    messages: 74,
    conversion: '80%',
    helpfulVotes: 234,
    reputationPoints: 450,
    trustScore: 95,
    growthTrend: '↑ 18%',
    viewsTrafficPath: 'M0,90 Q40,40 80,70 T160,20 T240,50 T320,10',
    updatesTrafficPath: 'M0,80 Q40,55 80,60 T160,40 T240,45 T320,25',
    followersTrafficPath: 'M0,95 Q40,75 80,80 T160,62 T240,65 T320,45',
  },
  '90d': {
    timeFilter: '90d',
    views: 4230,
    reach: 11400,
    followers: 350,
    messages: 210,
    conversion: '78%',
    helpfulVotes: 840,
    reputationPoints: 1420,
    trustScore: 98,
    growthTrend: '↑ 24%',
    viewsTrafficPath: 'M0,80 Q40,30 80,50 T160,15 T240,35 T320,5',
    updatesTrafficPath: 'M0,75 Q40,40 80,45 T160,25 T240,30 T320,15',
    followersTrafficPath: 'M0,88 Q40,58 80,65 T160,48 T240,52 T320,30',
  },
  'all': {
    timeFilter: 'all',
    views: 12450,
    reach: 34200,
    followers: 980,
    messages: 580,
    conversion: '82%',
    helpfulVotes: 1450,
    reputationPoints: 3400,
    trustScore: 99,
    growthTrend: '↑ 38%',
    viewsTrafficPath: 'M0,95 Q40,20 80,45 T160,10 T240,25 T320,2',
    updatesTrafficPath: 'M0,90 Q40,35 80,55 T160,22 T240,35 T320,8',
    followersTrafficPath: 'M0,85 Q40,50 80,65 T160,32 T240,45 T320,15',
  },
};

interface ContentInsightsState {
  timeFilter: '7d' | '30d' | '90d' | 'all';
  selectedInsightItemId: string | null;
  
  // Actions
  setTimeFilter: (filter: '7d' | '30d' | '90d' | 'all') => void;
  setSelectedInsightItemId: (id: string | null) => void;
  getAnalytics: () => CreatorAnalyticsData;
}

export const useContentInsightsStore = create<ContentInsightsState>((set, get) => ({
  timeFilter: '30d',
  selectedInsightItemId: null,

  setTimeFilter: (timeFilter) => set({ timeFilter }),
  setSelectedInsightItemId: (selectedInsightItemId) => set({ selectedInsightItemId }),
  getAnalytics: () => mockAnalyticsMap[get().timeFilter],
}));
