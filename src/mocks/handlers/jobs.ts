import type MockAdapter from 'axios-mock-adapter';
import { mockJobs } from '../jobs-data';
import type { JobOpportunity } from '@/types/job';
import { getDistanceKm } from '@/utils/geo';

// A dynamic memory store for newly created jobs during user session
let customJobs: JobOpportunity[] = [];

export function setupJobsMocks(mock: MockAdapter) {
  // GET /jobs
  mock.onGet(/\/jobs/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : '';
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    
    // Proximity parameters
    const lat = params.latitude ? Number(params.latitude) : null;
    const lon = params.longitude ? Number(params.longitude) : null;
    const radiusKm = params.radiusKm ? Number(params.radiusKm) : null;
    const distanceFilter = params.distance ? Number(params.distance) : radiusKm;
    const sortBy = params.sortBy ? String(params.sortBy) : '';

    const employmentType = params.employmentType ? String(params.employmentType) : '';
    const accommodation = params.accommodationIncluded === 'true';
    const meals = params.mealsIncluded === 'true';
    const transport = params.transportIncluded === 'true';
    const verifiedOnly = params.verifiedEmployer === 'true';

    // Combine static mock jobs and dynamic custom jobs
    const allJobs = [...customJobs, ...mockJobs];

    let filtered = allJobs.filter((job) => {
      // 1. Query matching
      if (query) {
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesDesc = job.description.toLowerCase().includes(query);
        const matchesEmployer = job.employer.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesEmployer) return false;
      }

      // 2. Category matching
      if (category && category !== 'All' && job.category !== category) return false;

      // 3. City matching (only if coordinates are NOT used for distance checking)
      if (cityName && (lat === null || lon === null) && job.location.cityName.toLowerCase() !== cityName) return false;

      // 4. Employment Type matching
      if (employmentType && job.employmentType !== employmentType) return false;

      // 5. Distance matching
      if (lat !== null && lon !== null && job.location.latitude && job.location.longitude) {
        const dist = getDistanceKm(lat, lon, job.location.latitude, job.location.longitude);
        if (distanceFilter !== null && dist > distanceFilter) return false;
      } else if (distanceFilter !== null && job.location.distanceKm !== undefined) {
        if (job.location.distanceKm > distanceFilter) return false;
      }

      // 6. Benefits filtering
      if (accommodation && !job.benefitsFlags.accommodationIncluded) return false;
      if (meals && !job.benefitsFlags.mealsIncluded) return false;
      if (transport && !job.benefitsFlags.transportIncluded) return false;

      // 7. Verified Employer filtering
      if (verifiedOnly && !job.employer.isVerified) return false;

      // Filter out drafts or archived in public queries
      if (job.status !== 'Active') return false;

      return true;
    });

    // Inject dynamic distances
    let responseData = filtered.map((job) => {
      if (lat !== null && lon !== null && job.location.latitude && job.location.longitude) {
        return {
          ...job,
          location: {
            ...job.location,
            distanceKm: getDistanceKm(lat, lon, job.location.latitude, job.location.longitude),
          },
        };
      }
      return job;
    });

    // Proximity Sorting
    if (sortBy === 'distance' || (lat !== null && lon !== null && sortBy !== 'rating')) {
      responseData.sort((a, b) => (a.location.distanceKm || 0) - (b.location.distanceKm || 0));
    }

    return [200, {
      data: responseData,
      pagination: {
        page: params.page || 1,
        pageSize: params.pageSize || 20,
        totalCount: responseData.length,
        totalPages: Math.ceil(responseData.length / (params.pageSize || 20)),
        hasNextPage: false,
      }
    }];
  });

  // GET /jobs/:id
  mock.onGet(/\/jobs\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const jobId = url.split('/').pop() || '';
    const allJobs = [...customJobs, ...mockJobs];
    const job = allJobs.find((j) => j.jobId === jobId);

    if (job) {
      return [200, { data: job }];
    } else {
      return [404, { message: `Job Opportunity ${jobId} not found` }];
    }
  });

  // POST /jobs
  mock.onPost(/\/jobs$/).reply((config) => {
    try {
      const data = JSON.parse(config.data);
      const newJob: JobOpportunity = {
        jobId: `job-custom-${Date.now()}`,
        title: data.title || 'Untitled Opportunity',
        category: data.category || 'Other',
        employmentType: data.employmentType || 'Full-Time',
        description: data.description || '',
        requirements: data.requirements || [],
        responsibilities: data.responsibilities || [],
        benefits: data.benefits || [],
        salary: data.salary || { amount: 0, currency: 'GBP', frequency: 'hourly' },
        location: data.location || { cityName: 'London', areaName: 'Unknown', addressLine: '' },
        employer: data.employer || {
          providerId: 'user-123',
          name: 'Amara Kone',
          avatarUrl: null,
          isVerified: true,
          rating: 5.0,
          reputationLevel: 'VerifiedResident',
          preferredContactMethod: 'whatsapp'
        },
        benefitsFlags: data.benefitsFlags || { accommodationIncluded: false, mealsIncluded: false, transportIncluded: false },
        experienceRequired: data.experienceRequired ?? false,
        languages: data.languages || ['English'],
        urgency: data.urgency || 'Normal',
        publishedAt: new Date().toISOString(),
        expiresAt: data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: data.status || 'Active',
        viewCount: 0
      };

      customJobs.unshift(newJob);
      console.log('[MOCK] Saved new job draft/post:', newJob.jobId);
      return [201, { data: newJob }];
    } catch (err) {
      return [400, { message: 'Invalid job opportunity payload' }];
    }
  });

  // `GET /employers/:id` was answered here until 15 Sep 2026 — a route no
  // backend module has ever served, and the only thing the employer page ever
  // reached. The real read, `GET /jobs/employers/{idOrSlug}`, is modelled in
  // `handlers/jobs-hiring.ts`.
}
