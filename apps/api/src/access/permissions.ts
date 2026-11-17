/**
 * Who may do what. This table is the single place where rights are defined;
 * controllers only name the action they need.
 *
 * A grant is "role R on site S". A grant with no site applies to all sites.
 */
import type { Department, Role } from '../generated/prisma/enums.js';

export type Action =
  | 'employee.read'
  | 'employee.setPin'
  | 'post.manage'
  | 'device.manage'
  | 'shift.read'
  | 'shift.write'
  | 'planning.publish'
  | 'absence.write'
  | 'day.lock'
  | 'day.payrollLock'
  | 'hours.read'
  | 'hours.validate';

export interface Grant {
  role: Role;
  siteId: string | null;
}

// Reading is wide, changing is narrow:
//   - every role sees the planning (and plain employees see their own site's,
//     which is checked separately because it depends on their assignment);
//   - a site director changes things on their site, a multi-site manager on
//     each of her sites;
//   - HR and the operations team have an overview of the whole organisation.
const ROLES_ALLOWED: Record<Action, Role[]> = {
  'employee.read': [
    'HEAD_CHEF',
    'MANAGER',
    'SITE_DIRECTOR',
    'MULTI_SITE_MANAGER',
    'HR',
    'OPS',
    'ADMIN',
  ],
  'employee.setPin': ['ADMIN'],
  'post.manage': ['ADMIN'],
  'device.manage': ['ADMIN'],
  'shift.read': [
    'HEAD_CHEF',
    'MANAGER',
    'SITE_DIRECTOR',
    'MULTI_SITE_MANAGER',
    'HR',
    'OPS',
    'ADMIN',
  ],
  'shift.write': ['HEAD_CHEF', 'SITE_DIRECTOR', 'MULTI_SITE_MANAGER', 'ADMIN'],
  // Publishing makes a week visible to the staff. The head chef publishes
  // the kitchen only (see DEPARTMENT_LIMIT); the director either department.
  'planning.publish': ['HEAD_CHEF', 'SITE_DIRECTOR', 'MULTI_SITE_MANAGER', 'ADMIN'],
  'absence.write': [
    'HEAD_CHEF',
    'SITE_DIRECTOR',
    'MULTI_SITE_MANAGER',
    'HR',
    'ADMIN',
  ],
  // Blue lock: the site decides. Red lock (payslips): HR only.
  'day.lock': ['SITE_DIRECTOR', 'MULTI_SITE_MANAGER', 'ADMIN'],
  'day.payrollLock': ['HR', 'ADMIN'],
  'hours.read': [
    'MANAGER',
    'SITE_DIRECTOR',
    'MULTI_SITE_MANAGER',
    'HR',
    'OPS',
    'ADMIN',
  ],
  'hours.validate': ['MANAGER', 'SITE_DIRECTOR', 'MULTI_SITE_MANAGER', 'ADMIN'],
};

/** Roles whose rights stop at one department of the site. */
const DEPARTMENT_LIMIT: Partial<Record<Role, Department>> = {
  HEAD_CHEF: 'KITCHEN',
};

/**
 * @param siteId     the site the action is about, or null for company-wide
 *                   actions (which then need a grant on all sites)
 * @param department given when the action touches one department (a shift on
 *                   a kitchen post, for example)
 */
export function can(
  grants: Grant[],
  action: Action,
  siteId: string | null,
  department?: Department,
): boolean {
  return grants.some((grant) => {
    if (!ROLES_ALLOWED[action].includes(grant.role)) return false;
    if (grant.siteId !== null && grant.siteId !== siteId) return false;
    const limit = DEPARTMENT_LIMIT[grant.role];
    if (limit && department && department !== limit) return false;
    return true;
  });
}
