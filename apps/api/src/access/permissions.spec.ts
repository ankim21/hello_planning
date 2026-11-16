import { can, type Grant } from './permissions.js';

const on = (role: Grant['role'], siteId: string | null): Grant[] => [
  { role, siteId },
];

describe('can', () => {
  it('limits a site director to their own site', () => {
    expect(can(on('SITE_DIRECTOR', 'a'), 'shift.write', 'a')).toBe(true);
    expect(can(on('SITE_DIRECTOR', 'a'), 'shift.write', 'b')).toBe(false);
  });

  it('lets a head chef plan the kitchen but not the salle', () => {
    expect(can(on('HEAD_CHEF', 'a'), 'shift.write', 'a', 'KITCHEN')).toBe(true);
    expect(can(on('HEAD_CHEF', 'a'), 'shift.write', 'a', 'SALLE')).toBe(false);
  });

  it('does not let a head chef see clocked hours', () => {
    expect(can(on('HEAD_CHEF', 'a'), 'hours.read', 'a')).toBe(false);
  });

  it('lets a manager see clocked hours but not plan', () => {
    expect(can(on('MANAGER', 'a'), 'hours.read', 'a')).toBe(true);
    expect(can(on('MANAGER', 'a'), 'shift.write', 'a')).toBe(false);
  });

  it('lets an administrator act on every site and company-wide', () => {
    expect(can(on('ADMIN', null), 'shift.write', 'b')).toBe(true);
    expect(can(on('ADMIN', null), 'post.manage', null)).toBe(true);
  });

  it('refuses company-wide actions to a site-level grant', () => {
    expect(can(on('ADMIN', 'a'), 'post.manage', null)).toBe(false);
  });

  it('keeps the payslip lock for HR', () => {
    expect(can(on('SITE_DIRECTOR', 'a'), 'day.lock', 'a')).toBe(true);
    expect(can(on('SITE_DIRECTOR', 'a'), 'day.payrollLock', 'a')).toBe(false);
    expect(can(on('HR', null), 'day.payrollLock', 'a')).toBe(true);
  });

  it('gives a multi-site manager the rights of a director on each of her sites', () => {
    const grants: Grant[] = [
      { role: 'MULTI_SITE_MANAGER', siteId: 'a' },
      { role: 'MULTI_SITE_MANAGER', siteId: 'b' },
    ];
    expect(can(grants, 'shift.write', 'a')).toBe(true);
    expect(can(grants, 'hours.validate', 'b')).toBe(true);
    expect(can(grants, 'shift.write', 'c')).toBe(false);
  });

  it('lets the operations team and HR see every site without changing the planning', () => {
    for (const role of ['OPS', 'HR'] as const) {
      expect(can(on(role, null), 'shift.read', 'a')).toBe(true);
      expect(can(on(role, null), 'hours.read', 'a')).toBe(true);
      expect(can(on(role, null), 'shift.write', 'a')).toBe(false);
      expect(can(on(role, null), 'hours.validate', 'a')).toBe(false);
    }
  });

  it('lets every role read the planning', () => {
    for (const role of ['HEAD_CHEF', 'MANAGER', 'SITE_DIRECTOR'] as const) {
      expect(can(on(role, 'a'), 'shift.read', 'a')).toBe(true);
    }
  });

  it('refuses everything without a grant', () => {
    expect(can([], 'employee.read', 'a')).toBe(false);
  });
});
