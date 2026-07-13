import type MockAdapter from 'axios-mock-adapter';
import { mockJobs } from '../jobs-data';
import type { JobOpportunity } from '@/types/job';

// A dynamic memory store for newly created jobs during user session
let customJobs: JobOpportunity[] = [];

export function setupJobsMocks(mock: MockAdapter) {
  // GET /jobs
  mock.onGet(/\/jobs/).reply((config) => {
    const params = config.params || {};
    const query = params.query ? String(params.query).toLowerCase() : '';
    const category = params.category ? String(params.category) : '';
    const cityName = params.cityName ? String(params.cityName).toLowerCase() : '';
    const maxDistance = params.distance ? Number(params.distance) : null;
    const employmentType = params.employmentType ? String(params.employmentType) : '';
    const accommodation = params.accommodationIncluded === 'true';
    const meals = params.mealsIncluded === 'true';
    const transport = params.transportIncluded === 'true';
    const verifiedOnly = params.verifiedEmployer === 'true';

    // Combine static mock jobs and dynamic custom jobs
    const allJobs = [...customJobs, ...mockJobs];

    const filtered = allJobs.filter((job) => {
      // 1. Query matching
      if (query) {
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesDesc = job.description.toLowerCase().includes(query);
        const matchesEmployer = job.employer.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesEmployer) return false;
      }

      // 2. Category matching
      if (category && category !== 'All' && job.category !== category) return false;

      // 3. City matching
      if (cityName && job.location.cityName.toLowerCase() !== cityName) return false;

      // 4. Employment Type matching
      if (employmentType && job.employmentType !== employmentType) return false;

      // 5. Distance matching
      if (maxDistance !== null && job.location.distanceKm !== undefined) {
        if (job.location.distanceKm > maxDistance) return false;
      }

      // 6. Benefits filtering
      if (accommodation && !job.benefitsFlags.accommodationIncluded) return false;
      if (meals && !job.benefitsFlags.mealsIncluded) return false;
      if (transport && !job.benefitsFlags.transportIncluded) return false;

      // 7. Verified Employer filtering
      if (verifiedOnly && !job.employer.isVerified) return false;

      // Filter out drafts or archived in public queries, except if requested specifically
      if (job.status !== 'Active') return false;

      return true;
    });

    return [200, {
      data: filtered,
      pagination: {
        page: params.page || 1,
        pageSize: params.pageSize || 20,
        totalCount: filtered.length,
        totalPages: Math.ceil(filtered.length / (params.pageSize || 20)),
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

  // GET /employers/:id
  mock.onGet(/\/employers\/[a-zA-Z0-9_-]+$/).reply((config) => {
    const url = config.url || '';
    const providerId = url.split('/').pop() || '';
    const allJobs = [...customJobs, ...mockJobs];

    // Find a job posted by this employer to extract details
    const refJob = allJobs.find((j) => j.employer.providerId === providerId);
    
    if (refJob) {
      const employerDetails = {
        providerId: refJob.employer.providerId,
        name: refJob.employer.name,
        avatarUrl: refJob.employer.avatarUrl,
        isVerified: refJob.employer.isVerified,
        rating: refJob.employer.rating || 4.5,
        reputationLevel: refJob.employer.reputationLevel || 'VerifiedResident',
        contactPhone: refJob.employer.contactPhone,
        contactEmail: refJob.employer.contactEmail,
        preferredContactMethod: refJob.employer.preferredContactMethod,
        location: refJob.location.cityName,
        description: `Dedicated member of the Diaspora community facilitating local employment and support in ${refJob.location.cityName}.`,
        followerCount: 42,
        verificationDate: '2026-01-10T12:00:00Z',
      };

      // Find other open roles by this employer
      const otherRoles = allJobs.filter((j) => j.employer.providerId === providerId);

      return [200, {
        data: {
          employer: employerDetails,
          jobs: otherRoles
        }
      }];
    } else {
      return [404, { message: `Employer profile ${providerId} not found` }];
    }
  });
}
