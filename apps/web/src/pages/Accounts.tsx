/**
 * Comptes: who can log in, and what each login may do.
 * For the administrators of the organisation only.
 *
 * An account is a login. A role is given on one restaurant (chef, manager,
 * director, multi-site) or for the whole organisation (ops, HR,
 * administrator). Linking an account to an employee gives that person
 * "Mon espace".
 */
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { type Account, type AccountOptions, api } from '../api.ts'
import { ORGANISATION_ROLES, ROLE_HELP, ROLE_LABELS, SITE_ROLES } from './roles.ts'
import { Shell } from './Shell.tsx'

/** The server either e-mailed a link, or returns a temporary password. */
interface PasswordResult {
  emailed: boolean
  temporaryPassword?: string
}

export function Accounts() {
  return <Shell>{({ me }) => <Content myId={me.id} />}</Shell>
}

function Content({ myId }: { myId: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [options, setOptions] = useState<AccountOptions | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What just happened to a password: a link was e-mailed, or (when e-mail
  // could not be sent) a temporary password to hand over, shown once.
  const [secret, setSecret] = useState<{ email: string; password: string | null } | null>(null)

  const load = useCallback(() => {
    api<Account[]>('/accounts')
      .then(setAccounts)
      .catch((caught) => setError((caught as Error).message))
    api<AccountOptions>('/accounts/options').then(setOptions).catch(() => undefined)
  }, [])
  useEffect(load, [load])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  async function resetPassword(account: Account) {
    if (!window.confirm(`Envoyer à ${account.email} un lien pour choisir un nouveau mot de passe ?`)) return
    await run(async () => {
      const result = await api<PasswordResult>(`/accounts/${account.id}/reset-password`, {
        method: 'POST',
        body: {},
      })
      setSecret({ email: account.email, password: result.temporaryPassword ?? null })
    })
  }

  if (!accounts || !options) {
    return <main>{error && <p className="error">{error}</p>}</main>
  }

  const wanted = search.trim().toLowerCase()
  const shown = accounts.filter((account) =>
    `${account.email} ${account.employee?.firstName ?? ''} ${account.employee?.lastName ?? ''}`
      .toLowerCase()
      .includes(wanted),
  )

  return (
    <main>
      <div className="row toolbar">
        <h1>Comptes et rôles</h1>
        <span className="period">
          <input
            type="search"
            placeholder="Rechercher un nom ou un e-mail"
            aria-label="Rechercher un compte"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="primary" onClick={() => setCreating(true)}>
            Créer un compte
          </button>
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      {secret &&
        (secret.password === null ? (
          <p className="notice secret">
            Un e-mail vient d'être envoyé à <strong>{secret.email}</strong> avec un lien pour
            choisir son mot de passe. <button onClick={() => setSecret(null)}>Compris</button>
          </p>
        ) : (
          <p className="notice secret">
            L'e-mail n'a pas pu être envoyé. Mot de passe temporaire de{' '}
            <strong>{secret.email}</strong> : <code>{secret.password}</code>
            <br />
            Transmettez-le à la personne. Il n'est affiché qu'une seule fois, et elle devra le
            remplacer à sa première connexion.{' '}
            <button onClick={() => setSecret(null)}>J'ai noté</button>
          </p>
        ))}

      <p className="muted">
        {accounts.length} compte{accounts.length > 1 ? 's' : ''}
        {wanted && ` · ${shown.length} affiché${shown.length > 1 ? 's' : ''}`}
      </p>

      <ul className="plain accounts">
        {shown.map((account) => (
          <li key={account.id} className={account.isActive ? 'panel account' : 'panel account inactive'}>
            <div className="row">
              <span className="account-who">
                <strong>
                  {account.employee
                    ? `${account.employee.firstName} ${account.employee.lastName}`
                    : 'Compte sans salarié'}
                </strong>
                <span className="muted">{account.email}</span>
              </span>
              <span className="account-state">
                {!account.isActive && <span className="state leave-REFUSED">Désactivé</span>}
                {account.isActive && account.mustChangePassword && (
                  <span className="state leave-PENDING">Mot de passe temporaire</span>
                )}
                {account.id === myId && <span className="state ok">Vous</span>}
              </span>
            </div>

            <div className="grants">
              {account.grants.length === 0 && (
                <span className="muted">
                  {account.employee ? 'Salarié, sans rôle de gestion' : 'Aucun rôle'}
                </span>
              )}
              {account.grants.map((grant) => (
                <span key={grant.id} className="grant" title={ROLE_HELP[grant.role]}>
                  <strong>{ROLE_LABELS[grant.role] ?? grant.role}</strong>
                  <span>{grant.site ? grant.site.name : 'tous les sites'}</span>
                  <button
                    aria-label={`Retirer ${ROLE_LABELS[grant.role]} à ${account.email}`}
                    title="Retirer ce rôle"
                    onClick={() =>
                      run(() =>
                        api(`/accounts/${account.id}/grants/${grant.id}`, { method: 'DELETE' }),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <AddRole
              sites={options.sites}
              onAdd={(role, siteId) =>
                run(() =>
                  api(`/accounts/${account.id}/grants`, { method: 'POST', body: { role, siteId } }),
                )
              }
            />

            <div className="account-actions">
              <button onClick={() => resetPassword(account)}>Envoyer un lien de mot de passe</button>
              {account.id !== myId && (
                <button
                  className={account.isActive ? 'danger' : ''}
                  onClick={() =>
                    run(() =>
                      api(`/accounts/${account.id}/active`, {
                        method: 'PUT',
                        body: { isActive: !account.isActive },
                      }),
                    )
                  }
                >
                  {account.isActive ? 'Désactiver le compte' : 'Réactiver le compte'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {creating && (
        <CreateDialog
          options={options}
          onClose={() => setCreating(false)}
          onCreated={(email, password) => {
            setCreating(false)
            setSecret({ email, password })
            load()
          }}
        />
      )}
    </main>
  )
}

/** Choose a role, then a restaurant when the role is held on one. */
function AddRole({
  sites,
  onAdd,
}: {
  sites: AccountOptions['sites']
  onAdd: (role: string, siteId: string | null) => void
}) {
  const [role, setRole] = useState('')
  const [siteId, setSiteId] = useState('')
  const needsSite = SITE_ROLES.includes(role)

  return (
    <div className="add-role">
      <select
        aria-label="Rôle à ajouter"
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        <option value="">Ajouter un rôle…</option>
        <optgroup label="Sur un site">
          {SITE_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Toute l'organisation">
          {ORGANISATION_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </optgroup>
      </select>
      {needsSite && (
        <select
          aria-label="Site du rôle"
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
        >
          <option value="">Choisir le site…</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      )}
      {role && (
        <>
          <button
            className="primary"
            disabled={needsSite && !siteId}
            onClick={() => {
              onAdd(role, needsSite ? siteId : null)
              setRole('')
              setSiteId('')
            }}
          >
            Ajouter
          </button>
          <span className="muted role-help">{ROLE_HELP[role]}</span>
        </>
      )}
    </div>
  )
}

function CreateDialog({
  options,
  onClose,
  onCreated,
}: {
  options: AccountOptions
  onClose: () => void
  onCreated: (email: string, password: string | null) => void
}) {
  const [email, setEmail] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api<PasswordResult>('/accounts', {
        method: 'POST',
        body: { email, employeeId: employeeId || null },
      })
      onCreated(email.toLowerCase(), result.temporaryPassword ?? null)
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Créer un compte"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="dialog-head absence">
          <div className="row">
            <strong className="dialog-title">Créer un compte</strong>
            <button type="button" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div className="dialog-date">
            La personne recevra un e-mail pour choisir son mot de passe.
          </div>
        </header>
        <div className="stack dialog-body">
          <label>
            E-mail de connexion
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Salarié rattaché
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Aucun (compte de bureau, sans planning personnel)</option>
              {options.employeesWithoutAccount.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.lastName} {person.firstName}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Rattaché à un salarié, le compte donne accès à « Mon espace » : son planning, ses
            restaurants, ses congés. Les rôles de gestion s'ajoutent ensuite.
          </p>
          {error && <p className="error">{error}</p>}
        </div>
        <footer className="row dialog-body">
          <span />
          <span>
            <button type="button" onClick={onClose}>
              Annuler
            </button>{' '}
            <button type="submit" className="primary" disabled={busy}>
              Créer le compte
            </button>
          </span>
        </footer>
      </form>
    </div>
  )
}
