import type { Grant } from '../access/permissions.js';
import { canDecide, routeFor } from './leave.rules.js';

const on = (role: Grant['role'], siteId: string | null): Grant[] => [
  { role, siteId },
];

describe('routeFor', () => {
  it('sends restaurant staff to the site director', () => {
    expect(routeFor({ siteType: 'RESTAURANT', isSiteDirector: false })).toBe('DIRECTOR');
  });

  it('sends a site director to the multi-site manager', () => {
    expect(routeFor({ siteType: 'RESTAURANT', isSiteDirector: true })).toBe('MULTI_SITE');
  });

  it('sends office and lab staff to HR', () => {
    for (const siteType of ['OFFICE', 'LAB'] as const) {
      expect(routeFor({ siteType, isSiteDirector: false })).toBe('HR');
    }
  });
});

describe('canDecide', () => {
  const request = { route: 'DIRECTOR', siteId: 'a' } as const;

  it('lets the site director of the site decide, not another site', () => {
    expect(canDecide(on('SITE_DIRECTOR', 'a'), request)).toBe(true);
    expect(canDecide(on('SITE_DIRECTOR', 'b'), request)).toBe(false);
  });

  it('keeps head chefs and managers out', () => {
    expect(canDecide(on('HEAD_CHEF', 'a'), request)).toBe(false);
    expect(canDecide(on('MANAGER', 'a'), request)).toBe(false);
  });

  it('keeps a site director away from a site director request', () => {
    const own = { route: 'MULTI_SITE', siteId: 'a' } as const;
    expect(canDecide(on('SITE_DIRECTOR', 'a'), own)).toBe(false);
    expect(canDecide(on('MULTI_SITE_MANAGER', 'a'), own)).toBe(true);
  });

  it('lets a multi-site manager decide staff requests on her sites', () => {
    expect(canDecide(on('MULTI_SITE_MANAGER', 'a'), request)).toBe(true);
    expect(canDecide(on('MULTI_SITE_MANAGER', 'b'), request)).toBe(false);
  });

  it('keeps office requests for HR', () => {
    const office = { route: 'HR', siteId: 'office' } as const;
    expect(canDecide(on('HR', null), office)).toBe(true);
    expect(canDecide(on('SITE_DIRECTOR', 'office'), office)).toBe(false);
  });
});
