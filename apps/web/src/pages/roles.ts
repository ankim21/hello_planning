// The roles, in French, with what each one means. Shown wherever a role is
// chosen or displayed, so the wording stays the same everywhere.

export const ROLE_LABELS: Record<string, string> = {
  HEAD_CHEF: 'Chef de cuisine',
  MANAGER: 'Manager',
  SITE_DIRECTOR: 'Responsable de site',
  MULTI_SITE_MANAGER: 'Responsable multisite',
  OPS: 'Équipe opérationnelle',
  HR: 'Ressources humaines',
  ADMIN: 'Administrateur',
}

export const ROLE_HELP: Record<string, string> = {
  HEAD_CHEF: 'Planifie et publie la cuisine, décide les congés de la cuisine.',
  MANAGER: 'Voit le planning, vérifie et valide les badgeages.',
  SITE_DIRECTOR: 'Gère tout le site : planning, badgeuse, congés de la salle.',
  MULTI_SITE_MANAGER: 'Comme un responsable de site, sur chacun de ses sites.',
  OPS: "Voit tous les sites, sans rien modifier.",
  HR: 'Voit tous les sites, saisit les absences, verrouille la paie.',
  ADMIN: 'Tous les droits, dont les comptes, les rôles et les tablettes.',
}

/** Roles given on one restaurant; the others cover the whole organisation. */
export const SITE_ROLES = ['HEAD_CHEF', 'MANAGER', 'SITE_DIRECTOR', 'MULTI_SITE_MANAGER']
export const ORGANISATION_ROLES = ['OPS', 'HR', 'ADMIN']
