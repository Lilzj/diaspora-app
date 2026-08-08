// Diaspora Platform - Geolocation & Distance Utilities

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula. Returns distance in kilometers.
 */
export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Formats a distance in kilometers to a user-friendly string.
 */
export function formatDistance(km: number | undefined | null): string {
  if (km === undefined || km === null || isNaN(km)) return '';
  if (km < 0.1) {
    return 'In Your Neighborhood';
  }
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters}m away`;
  }
  return `${km.toFixed(1)} km away`;
}

/**
 * Estimates commute time based on distance in kilometers.
 * Walking: 5 km/h
 * Driving: 40 km/h (average urban traffic)
 * Transit: 20 km/h (including waiting times)
 */
export function getCommuteTimeEstimate(
  km: number | undefined | null,
  method: 'walk' | 'drive' | 'transit' = 'drive'
): string {
  if (km === undefined || km === null || isNaN(km) || km === 0) return '';

  let minutes = 0;
  switch (method) {
    case 'walk':
      minutes = (km / 5) * 60;
      break;
    case 'transit':
      minutes = (km / 20) * 60 + 5; // adding 5 mins buffer
      break;
    case 'drive':
    default:
      minutes = (km / 40) * 60 + 2; // adding 2 mins traffic buffer
      break;
  }

  const rounded = Math.round(minutes);
  if (rounded <= 1) return '1 min';
  if (rounded < 60) return `${rounded} mins`;
  
  const hours = Math.floor(rounded / 60);
  const remainingMins = rounded % 60;
  if (remainingMins === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMins} min${remainingMins > 1 ? 's' : ''}`;
}

/**
 * Checks if a target coordinate is within a given radius from a center coordinate.
 */
export function isWithinRadius(
  centerLat: number,
  centerLon: number,
  targetLat: number,
  targetLon: number,
  radiusKm: number
): boolean {
  const dist = getDistanceKm(centerLat, centerLon, targetLat, targetLon);
  return dist <= radiusKm;
}
