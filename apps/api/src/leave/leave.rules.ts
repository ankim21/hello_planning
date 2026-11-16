/**
 * Who decides a leave request. Pure functions, tested in leave.rules.spec.ts.
 *
 * As given by the company:
 *   - restaurant staff, kitchen included: the site director, and nobody else;
 *   - a site director: the multi-site manager, who can also decide any
 *     request of her sites;
 *   - office and lab staff: the HR team.
 */
import type { Grant } from '../access/permissions.js';
import type { LeaveRoute, SiteType } from '../generated/prisma/enums.js';

export interface Requester {
  siteType: SiteType;
  /** The employee is site director of that site. */
  isSiteDirector: boolean;
}

export function routeFor(requester: Requester): LeaveRoute {
  if (requester.siteType !== 'RESTAURANT') return 'HR';
  return requester.isSiteDirector ? 'MULTI_SITE' : 'DIRECTOR';
}

const ROLE_FOR_ROUTE = {
  DIRECTOR: 'SITE_DIRECTOR',
  MULTI_SITE: 'MULTI_SITE_MANAGER',
  HR: 'HR',
} as const;

/** May this person decide the request? Only they see it, besides its author. */
export function canDecide(
  grants: Grant[],
  request: { route: LeaveRoute; siteId: string },
): boolean {
  return grants.some(
    (grant) =>
      (grant.siteId === null || grant.siteId === request.siteId) &&
      (grant.role === 'ADMIN' ||
        grant.role === ROLE_FOR_ROUTE[request.route] ||
        // A multi-site manager also decides what her site directors decide.
        (grant.role === 'MULTI_SITE_MANAGER' && request.route === 'DIRECTOR')),
  );
}
