/**
 * The form for an employee record: who the person is, where they work, on
 * which posts, and with which contract. Used to create a record (alone, or
 * for an account that has nobody behind it) and to change one.
 *
 * This is the person. Their login is the account, managed next to it.
 */
import { type FormEvent, useState } from 'react'
import { type AccountOptions, api, type EmployeeRecord } from '../api.ts'
import { today } from './dates.ts'

const CONTRACT_LABELS = {
  CDI: 'CDI',
  CDD: 'CDD',
  EXTRA: 'Extra',
  APPRENTICE: 'Apprenti',
  INTERN: 'Stage',
  TEMPORARY: 'Temporaire',
} as const

/** The contract hours used in the company; another value can be typed. */
const USUAL_HOURS = [39, 35, 25]

interface Props {
  options: AccountOptions
  /** The record to change; absent to create one. */
  employee?: EmployeeRecord
  /** When creating: the account to attach the new person to. */
  forAccount?: { id: string; email: string }
  onClose: () => void
  onSaved: () => void
}

export function EmployeeForm({ options, employee, forAccount, onClose, onSaved }: Props) {
  const contract = employee?.contract
  const [firstName, setFirstName] = useState(employee?.firstName ?? '')
  const [lastName, setLastName] = useState(employee?.lastName ?? '')
  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [primarySiteId, setPrimarySiteId] = useState(employee?.primarySiteId ?? '')
  const [otherSiteIds, setOtherSiteIds] = useState<string[]>(
    employee?.sites.filter((site) => !site.isPrimary).map((site) => site.id) ?? [],
  )
  const [postIds, setPostIds] = useState<string[]>(employee?.postIds ?? [])
  const [contractType, setContractType] = useState(contract?.type ?? 'CDI')
  const [forfaitJours, setForfaitJours] = useState(contract?.forfaitJours ?? false)
  const [weeklyHours, setWeeklyHours] = useState(String(contract?.weeklyHours ?? 39))
  const [startDate, setStartDate] = useState(contract?.startDate ?? today())
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]

  const pinValid = pin === '' || /^\d{4}$/.test(pin)
  const hoursValid = forfaitJours || Number(weeklyHours) > 0
  const ready = firstName.trim() && lastName.trim() && primarySiteId && pinValid && hoursValid

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const body = {
      firstName,
      lastName,
      phone: phone.trim() || null,
      primarySiteId,
      otherSiteIds: otherSiteIds.filter((id) => id !== primarySiteId),
      postIds,
      contractType,
      forfaitJours,
      weeklyHours: forfaitJours ? null : Number(weeklyHours),
      startDate,
      ...(pin ? { pin } : {}),
    }
    try {
      if (employee) {
        await api(`/employees/${employee.id}`, { method: 'PUT', body })
      } else {
        const query = forAccount ? `?forAccount=${forAccount.id}` : ''
        await api(`/employees${query}`, { method: 'POST', body })
      }
      onSaved()
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  const title = employee
    ? `Fiche de ${employee.firstName} ${employee.lastName}`
    : forAccount
      ? 'Créer la fiche salarié du compte'
      : 'Nouveau salarié'

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog employee-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="dialog-head absence">
          <div className="row">
            <strong className="dialog-title">{title}</strong>
            <button type="button" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div className="dialog-date">
            {forAccount
              ? `Rattachée au compte ${forAccount.email} : il aura son planning, ses restaurants et ses congés.`
              : 'Le salarié apparaît sur le planning de ses restaurants.'}
          </div>
        </header>

        <div className="stack dialog-body">
          <div className="fields">
            <label>
              Prénom
              <input required autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label>
              Nom
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>

          <div className="fields">
            <label>
              Restaurant principal
              <select required value={primarySiteId} onChange={(e) => setPrimarySiteId(e.target.value)}>
                <option value="">Choisir…</option>
                {options.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Téléphone (facultatif)
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          <fieldset className="checks">
            <legend>Travaille aussi à</legend>
            {options.sites
              .filter((site) => site.id !== primarySiteId)
              .map((site) => (
                <label key={site.id} className="radio">
                  <input
                    type="checkbox"
                    checked={otherSiteIds.includes(site.id)}
                    onChange={() => setOtherSiteIds(toggle(otherSiteIds, site.id))}
                  />
                  {site.name}
                </label>
              ))}
          </fieldset>

          {(['SALLE', 'KITCHEN'] as const).map((department) => (
            <fieldset key={department} className="checks">
              <legend>Postes en {department === 'SALLE' ? 'salle' : 'cuisine'}</legend>
              {options.posts
                .filter((post) => post.department === department)
                .map((post) => (
                  <label key={post.id} className="radio">
                    <input
                      type="checkbox"
                      checked={postIds.includes(post.id)}
                      onChange={() => setPostIds(toggle(postIds, post.id))}
                    />
                    {post.name}
                  </label>
                ))}
            </fieldset>
          ))}

          <div className="fields">
            <label>
              Contrat
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value as typeof contractType)}
              >
                {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Heures par semaine
              <input
                type="number"
                min={1}
                max={60}
                step="0.5"
                list="usual-hours"
                disabled={forfaitJours}
                value={forfaitJours ? '' : weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
              />
              <datalist id="usual-hours">
                {USUAL_HOURS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label>
              Début du contrat
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
          <label className="radio">
            <input
              type="checkbox"
              checked={forfaitJours}
              onChange={(e) => setForfaitJours(e.target.checked)}
            />
            Forfait jours (sans compteur d'heures, ne badge pas)
          </label>

          <label>
            Code PIN de la badgeuse (4 chiffres)
            <input
              inputMode="numeric"
              maxLength={4}
              placeholder={employee?.hasPin ? 'Déjà défini — laisser vide pour le garder' : 'Facultatif'}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {!pinValid && <p className="error">Le code PIN fait 4 chiffres.</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <footer className="row dialog-body">
          <span />
          <span>
            <button type="button" onClick={onClose}>
              Annuler
            </button>{' '}
            <button type="submit" className="primary" disabled={busy || !ready}>
              {employee ? 'Enregistrer' : 'Créer la fiche'}
            </button>
          </span>
        </footer>
      </form>
    </div>
  )
}
