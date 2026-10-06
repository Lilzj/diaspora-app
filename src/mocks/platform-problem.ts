// The error body the platform sends, for mocks to send too.
//
// The shape is `PlatformProblem` in the backend (`Diaspora.Platform/Http`): an
// RFC 7807 problem whose `type` is `https://diaspora.app/errors/{code}` and
// whose `code` extension is what the client reads. Mocks that answered with
// `{ message }` or put the code only in `title` disagreed with the server, so
// a development build showed a different error from production for the same
// refusal (found 6 Oct 2026 under Google Calendar). `mock-problem-shape.test.ts`
// keeps every handler on this helper.

/** `PlatformErrorCodes` — the generic codes the platform sends when no module code applies. */
export const PLATFORM_CODES = {
  validation: 'Platform.Validation.Failed',
  unauthorized: 'Platform.Auth.Unauthorized',
  forbidden: 'Platform.Auth.Forbidden',
  notFound: 'Platform.Resource.NotFound',
  conflict: 'Platform.Resource.Conflict',
  rateLimited: 'Platform.RateLimit.Exceeded',
  unavailable: 'Platform.Dependency.Unavailable',
  unexpected: 'Platform.Unexpected',
} as const;

export interface PlatformProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  correlationId: string;
  traceId: string;
  timestamp: string;
}

const TITLES: Record<number, string> = {
  400: 'Validation failed',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  503: 'Service unavailable',
};

/** The platform's generic code for a status, as `PlatformErrorCodes` assigns them. */
export function genericCodeFor(status: number): string {
  if (status === 400 || status === 422) return PLATFORM_CODES.validation;
  if (status === 401) return PLATFORM_CODES.unauthorized;
  if (status === 403) return PLATFORM_CODES.forbidden;
  if (status === 404) return PLATFORM_CODES.notFound;
  if (status === 409) return PLATFORM_CODES.conflict;
  if (status === 429) return PLATFORM_CODES.rateLimited;
  if (status === 503) return PLATFORM_CODES.unavailable;
  return PLATFORM_CODES.unexpected;
}

/**
 * A mock reply carrying the platform's error body.
 *
 * `code` defaults to the generic code for the status. Pass the module's own
 * code (`integrations.provider.not-configured`) wherever the server sends one.
 */
export function platformProblem(
  status: number,
  detail?: string,
  code: string = genericCodeFor(status),
  title: string = TITLES[status] ?? 'Unexpected error'
): [number, PlatformProblemBody] {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title,
      status,
      ...(detail !== undefined ? { detail } : {}),
      code,
      correlationId: 'mock',
      traceId: 'mock',
      timestamp: new Date().toISOString(),
    },
  ];
}
