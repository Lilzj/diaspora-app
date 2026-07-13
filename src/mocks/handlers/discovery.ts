import type MockAdapter from 'axios-mock-adapter';

export function setupDiscoveryMocks(mock: MockAdapter) {
  mock.onGet(/\/listings.*/).reply(200, {
    data: [
      {
        listingId: 'list-1',
        listingType: 'Service',
        title: 'Mama Afrika Kitchen',
        description: 'Authentic Ghanaian cuisine...',
        category: { id: 'cat-1', name: 'Food & Restaurants', iconName: 'restaurant-outline' },
        location: {
          cityId: 'city-1',
          cityName: 'London',
          areaName: 'Peckham',
          distanceKm: 1.2,
          serviceType: 'Fixed',
        },
        coverImageUrl: 'https://images.unsplash.com/photo-1544148103-0773bf10d330',
        rating: { average: 4.8, totalReviews: 124 },
        verificationStatus: 'Verified',
        isFeatured: true,
        isOpenNow: true,
      },
      {
        listingId: 'list-2',
        listingType: 'Service',
        title: 'Ebony Braids & Beauty',
        description: 'Professional hair braiding services.',
        category: { id: 'cat-2', name: 'Hair & Beauty', iconName: 'cut-outline' },
        location: {
          cityId: 'city-1',
          cityName: 'London',
          areaName: 'Brixton',
          distanceKm: 3.5,
          serviceType: 'Fixed',
        },
        coverImageUrl: 'https://images.unsplash.com/photo-1560014169-42b78ce13eb0',
        rating: { average: 4.9, totalReviews: 89 },
        verificationStatus: 'Verified',
        isFeatured: false,
        isOpenNow: false,
      },
    ],
    pagination: { page: 1, pageSize: 20, totalCount: 2, totalPages: 1, hasNextPage: false },
  });
}
