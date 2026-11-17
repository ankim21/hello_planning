/**
 * Who decides a leave request, and who may see it. Pure functions, tested in
 * leave.rules.spec.ts.
 *
 * As given by the company (17 Nov 2026):
 *   - salle staff: the site director;
 *   - kitchen staff: the head chef;
 *   - the head chef's own request: the site director;
 *   - a site director's own request: the multi-site manager, and only her;
 *   - a multi-site manager's own request: the operations team;
 *   - the operations team's own requests, office and lab staff: the HR team.
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
  /** The employee belongs to the operations team. */
  isOps: boolean;
  /** The employee is multi-site manager of that site. */
  isMultiSiteManager: boolean;
  /** The employee is site director of that site. */
  isSiteDirector: boolean;
  /** The employee is head chef of that site. */
  isHeadChef: boolean;
  /** Departments of the posts the employee holds. */
  postDepartments: Department[];
}

export function routeFor(requester: Requester): LeaveRoute {
  // The highest role held decides, whatever the site the person is attached to.
  if (requester.isOps) return 'HR';
  if (requester.isMultiSiteManager) return 'OPS';
  if (requester.isSiteDirector) return 'MULTI_SITE';
  if (requester.siteType !== 'RESTAURANT') return 'HR';
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
  OPS: 'OPS',
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

/** The requests each overview role follows without deciding them all. */
const OVERVIEW: Partial<Record<Grant['role'], LeaveRoute[]>> = {
  SITE_DIRECTOR: ['DIRECTOR', 'CHEF'],
  MULTI_SITE_MANAGER: ['DIRECTOR', 'CHEF', 'MULTI_SITE'],
};

/**
 * May this person see the request? Those who decide it, plus the site
 * director and the multi-site manager for the requests of the people below
 * them in their restaurants. Nobody sees a request from above them.
 */
export function canSee(
  grants: Grant[],
  request: { route: LeaveRoute; siteId: string },
): boolean {
  return (
    canDecide(grants, request) ||
    grants.some(
      (grant) =>
        onSite(grant, request.siteId) &&
        (OVERVIEW[grant.role]?.includes(request.route) ?? false),
    )
  );
}
