/**
 * Who decides a leave request, and who may see it. Pure functions, tested in
 * leave.rules.spec.ts.
 *
 * As given by the company (multi-site director, 2026-11-17):
 *   - salle staff: the site director;
 *   - kitchen staff: the head chef;
 *   - the head chef's own request: the site director;
 *   - a site director's own request: the multi-site manager;
 *   - office and lab staff: the HR team.
 * The multi-site manager and the site director see every request of their
 * restaurants, to keep an overview.
 */
import type { Grant } from '../access/permissions.js';
import type {
  Department,
  LeaveRoute,
  SiteType,
} from '../generated/prisma/enums.js';

export interface Requester {
  siteType: SiteType;
  /** The employee is site director of that site. */
  isSiteDirector: boolean;
  /** The employee is head chef of that site. */
  isHeadChef: boolean;
  /** Departments of the posts the employee holds. */
  postDepartments: Department[];
}

export function routeFor(requester: Requester): LeaveRoute {
  if (requester.siteType !== 'RESTAURANT') return 'HR';
  if (requester.isSiteDirector) return 'MULTI_SITE';
  if (requester.isHeadChef) return 'DIRECTOR';
  // Kitchen staff = every post held is a kitchen post. Someone who also
  // holds a salle post goes to the site director.
  const kitchenOnly =
    requester.postDepartments.length > 0 &&
    requester.postDepartments.every((department) => department === 'KITCHEN');
  return kitchenOnly ? 'CHEF' : 'DIRECTOR';
}

const ROLE_FOR_ROUTE = {
  DIRECTOR: 'SITE_DIRECTOR',
  CHEF: 'HEAD_CHEF',
  MULTI_SITE: 'MULTI_SITE_MANAGER',
  HR: 'HR',
} as const;

const onSite = (grant: Grant, siteId: string) =>
  grant.siteId === null || grant.siteId === siteId;

/** May this person decide the request? */
export function canDecide(
  grants: Grant[],
  request: { route: LeaveRoute; siteId: string },
): boolean {
  return grants.some(
    (grant) =>
      onSite(grant, request.siteId) &&
      (grant.role === 'ADMIN' ||
        grant.role === ROLE_FOR_ROUTE[request.route] ||
        // A multi-site manager also decides what her site directors decide.
        (grant.role === 'MULTI_SITE_MANAGER' && request.route === 'DIRECTOR')),
  );
}

/**
 * May this person see the request? Those who decide it, plus the site
 * director and the multi-site manager for every request of the restaurant.
 */
export function canSee(
  grants: Grant[],
  request: { route: LeaveRoute; siteId: string },
): boolean {
  return (
    canDecide(grants, request) ||
    (request.route !== 'HR' &&
      grants.some(
        (grant) =>
          onSite(grant, request.siteId) &&
          (grant.role === 'SITE_DIRECTOR' || grant.role === 'MULTI_SITE_MANAGER'),
      ))
  );
}
