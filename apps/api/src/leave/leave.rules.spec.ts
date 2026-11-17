import type { Grant } from '../access/permissions.js';
import { canDecide, canSee, routeFor } from './leave.rules.js';

const on = (role: Grant['role'], siteId: string | null): Grant[] => [
  { role, siteId },
];
const staff = {
  siteType: 'RESTAURANT',
  isSiteDirector: false,
  isHeadChef: false,
} as const;

describe('routeFor', () => {
  it('sends salle staff to the site director', () => {
    expect(routeFor({ ...staff, postDepartments: ['SALLE'] })).toBe('DIRECTOR');
  });

  it('sends kitchen staff to the head chef', () => {
    expect(routeFor({ ...staff, postDepartments: ['KITCHEN', 'KITCHEN'] })).toBe('CHEF');
  });

  it('sends someone working in both to the site director', () => {
    expect(routeFor({ ...staff, postDepartments: ['KITCHEN', 'SALLE'] })).toBe('DIRECTOR');
  });

  it('sends the head chef to the site director, not to themselves', () => {
    expect(routeFor({ ...staff, isHeadChef: true, postDepartments: ['KITCHEN'] })).toBe(
      'DIRECTOR',
    );
  });

  it('sends a site director to the multi-site manager', () => {
    expect(routeFor({ ...staff, isSiteDirector: true, postDepartments: ['SALLE'] })).toBe(
      'MULTI_SITE',
    );
  });

  it('sends office and lab staff to HR', () => {
    for (const siteType of ['OFFICE', 'LAB'] as const) {
      expect(routeFor({ ...staff, siteType, postDepartments: [] })).toBe('HR');
    }
  });
});

describe('canDecide', () => {
  const salle = { route: 'DIRECTOR', siteId: 'a' } as const;
  const kitchen = { route: 'CHEF', siteId: 'a' } as const;

  it('lets the site director decide salle requests of their site only', () => {
    expect(canDecide(on('SITE_DIRECTOR', 'a'), salle)).toBe(true);
    expect(canDecide(on('SITE_DIRECTOR', 'b'), salle)).toBe(false);
  });

  it('lets the head chef decide kitchen requests, not salle ones', () => {
    expect(canDecide(on('HEAD_CHEF', 'a'), kitchen)).toBe(true);
    expect(canDecide(on('HEAD_CHEF', 'a'), salle)).toBe(false);
  });

  it('does not let the site director decide kitchen requests', () => {
    expect(canDecide(on('SITE_DIRECTOR', 'a'), kitchen)).toBe(false);
  });

  it('keeps a site director away from a site director request', () => {
    const own = { route: 'MULTI_SITE', siteId: 'a' } as const;
    expect(canDecide(on('SITE_DIRECTOR', 'a'), own)).toBe(false);
    expect(canDecide(on('MULTI_SITE_MANAGER', 'a'), own)).toBe(true);
  });

  it('keeps office requests for HR', () => {
    const office = { route: 'HR', siteId: 'office' } as const;
    expect(canDecide(on('HR', null), office)).toBe(true);
    expect(canDecide(on('SITE_DIRECTOR', 'office'), office)).toBe(false);
  });
});

describe('canSee', () => {
  const kitchen = { route: 'CHEF', siteId: 'a' } as const;
  const salle = { route: 'DIRECTOR', siteId: 'a' } as const;

  it('gives the multi-site manager an overview of every request of her sites', () => {
    expect(canSee(on('MULTI_SITE_MANAGER', 'a'), kitchen)).toBe(true);
    expect(canSee(on('MULTI_SITE_MANAGER', 'a'), salle)).toBe(true);
    expect(canSee(on('MULTI_SITE_MANAGER', 'b'), salle)).toBe(false);
  });

  it('lets the site director see kitchen requests without deciding them', () => {
    expect(canSee(on('SITE_DIRECTOR', 'a'), kitchen)).toBe(true);
    expect(canDecide(on('SITE_DIRECTOR', 'a'), kitchen)).toBe(false);
  });

  it('shows the head chef kitchen requests only', () => {
    expect(canSee(on('HEAD_CHEF', 'a'), kitchen)).toBe(true);
    expect(canSee(on('HEAD_CHEF', 'a'), salle)).toBe(false);
  });

  it('hides everything from managers', () => {
    expect(canSee(on('MANAGER', 'a'), salle)).toBe(false);
  });
});
