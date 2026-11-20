/**
 * The shared tablet's time clock.
 *
 * Steps: (0) one-time set-up with the tablet's code → (1) find your name in
 * the list, typing letters to narrow it → (2) PIN → (3) clock in / out / break.
 * After a clocking, or 30 seconds without a touch, it returns to step 1.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type ClockKind, deviceToken, type Person } from '../api.ts'

const ACTION_LABELS: Record<ClockKind, string> = {
  IN: 'Pointer mon arrivée',
  OUT: 'Pointer mon départ',
  BREAK_START: 'Début de pause',
  BREAK_END: 'Fin de pause',
}
const DONE_MESSAGES: Record<ClockKind, string> = {
  IN: 'Arrivée enregistrée',
  OUT: 'Départ enregistré',
  BREAK_START: 'Pause commencée',
  BREAK_END: 'Pause terminée',
}
const IDLE_RESET_MS = 30_000
const PIN_LENGTH = 4

/** Lower case, no accents: "é" and "E" find the same people. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** True when every typed word starts one of the words of the person's name. */
function matchesSearch(person: Person, search: string) {
  const words = plain(`${person.firstName} ${person.lastName}`).split(/[\s-]+/)
  return plain(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((typed) => words.some((word) => word.startsWith(typed)))
}

type Step =
  | { name: 'letters' }
  | { name: 'pin'; person: Person }
  | { name: 'actions'; person: Person; pin: string; actions: ClockKind[] }
  | { name: 'done'; message: string }

export function Kiosk() {
  const [siteName, setSiteName] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(deviceToken.get() === null)
  const [step, setStep] = useState<Step>({ name: 'letters' })
  const [letters, setLetters] = useState('')
  const [people, setPeople] = useState<Person[] | null>(null)
  const [round, setRound] = useState(0)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStep({ name: 'letters' })
    setLetters('')
    setRound((n) => n + 1)
    setPin('')
    setError(null)
  }, [])

  /** A refused token means the tablet was revoked: back to set-up. */
  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401 && caught.message === 'Unauthorized') {
      deviceToken.set(null)
      setNeedsSetup(true)
    } else {
      setError((caught as Error).message)
    }
  }, [])

  // Which site is this tablet registered for?
  useEffect(() => {
    if (needsSetup) return
    api<{ site: { name: string } }>('/kiosk/site', { asDevice: true })
      .then((data) => setSiteName(data.site.name))
      .catch(handleError)
  }, [needsSetup, handleError])

  // The site's names, fetched again after each clocking so that a new
  // colleague appears without restarting the tablet.
  useEffect(() => {
    if (needsSetup) return
    let cancelled = false
    api<Person[]>('/kiosk/employees', { asDevice: true })
      .then((list) => !cancelled && setPeople(list))
      .catch(handleError)
    return () => {
      cancelled = true
    }
  }, [needsSetup, round, handleError])

  const matches = useMemo(
    () => (people ?? []).filter((person) => matchesSearch(person, letters)),
    [people, letters],
  )

  // Never leave someone's name or PIN screen open on a shared tablet.
  useEffect(() => {
    if (step.name === 'letters' && letters === '') return
    const delay = step.name === 'done' ? 3_000 : IDLE_RESET_MS
    const timer = setTimeout(reset, delay)
    return () => clearTimeout(timer)
  }, [step, letters, pin, reset])

  if (needsSetup) {
    return (
      <SetupScreen
        onDone={() => {
          setNeedsSetup(false)
          reset()
        }}
      />
    )
  }

  async function submitPin(person: Person) {
    setError(null)
    try {
      const result = await api<{ nextActions: ClockKind[] }>('/kiosk/identify', {
        method: 'POST',
        asDevice: true,
        body: { employeeId: person.id, pin },
      })
      setStep({ name: 'actions', person, pin, actions: result.nextActions })
    } catch (caught) {
      setPin('')
      handleError(caught)
    }
  }

  async function clock(person: Person, personPin: string, kind: ClockKind) {
    setError(null)
    try {
      await api('/kiosk/clock', {
        method: 'POST',
        asDevice: true,
        body: {
          // Generated here so that re-sending the same clocking is harmless.
          eventId: crypto.randomUUID(),
          employeeId: person.id,
          pin: personPin,
          kind,
          occurredAt: new Date().toISOString(),
        },
      })
      setStep({ name: 'done', message: `${DONE_MESSAGES[kind]} — ${person.firstName}` })
    } catch (caught) {
      handleError(caught)
    }
  }

  return (
    <main className="kiosk">
      <header className="row">
        <strong>{siteName ?? '…'}</strong>
        <Clock />
      </header>

      {step.name === 'letters' && (
        <section className="stack">
          <h1>Qui êtes-vous ?</h1>
          <div className="kiosk-search">
            <input
              type="search"
              autoFocus
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Rechercher mon prénom ou mon nom"
              aria-label="Rechercher mon nom"
              value={letters}
              onChange={(e) => setLetters(e.target.value)}
            />
            {letters && (
              <button className="clear" aria-label="Effacer" onClick={() => setLetters('')}>
                ×
              </button>
            )}
          </div>
          <div className="people">
            {matches.map((person) => (
              <button key={person.id} onClick={() => setStep({ name: 'pin', person })}>
                <strong>{person.firstName}</strong> {person.lastName}
              </button>
            ))}
          </div>
          {people !== null && matches.length === 0 && (
            <p className="muted center">
              {people.length === 0
                ? "Aucun salarié n'est rattaché à cet établissement."
                : `Aucun nom ne commence par « ${letters} ».`}
            </p>
          )}
        </section>
      )}

      {step.name === 'pin' && (
        <section className="stack">
          <h1>
            {step.person.firstName} {step.person.lastName}
          </h1>
          <p className="pin-dots">{'●'.repeat(pin.length) || 'Saisissez votre code PIN'}</p>
          <div className="pinpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button key={digit} onClick={() => setPin((p) => (p + digit).slice(0, PIN_LENGTH))}>
                {digit}
              </button>
            ))}
            <button onClick={reset}>Annuler</button>
            <button onClick={() => setPin((p) => (p + '0').slice(0, PIN_LENGTH))}>0</button>
            <button
              className="primary"
              disabled={pin.length < PIN_LENGTH}
              onClick={() => submitPin(step.person)}
            >
              OK
            </button>
          </div>
        </section>
      )}

      {step.name === 'actions' && (
        <section className="stack">
          <h1>Bonjour {step.person.firstName}</h1>
          <div className="choices">
            {step.actions.map((kind) => (
              <button
                key={kind}
                className="primary"
                onClick={() => clock(step.person, step.pin, kind)}
              >
                {ACTION_LABELS[kind]}
              </button>
            ))}
            <button onClick={reset}>Annuler</button>
          </div>
        </section>
      )}

      {step.name === 'done' && <p className="done">{step.message}</p>}

      {error && <p className="error">{error}</p>}
    </main>
  )
}

/** One-time: an administrator types the code obtained when registering the tablet. */
function SetupScreen({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    deviceToken.set(token.trim())
    try {
      await api('/kiosk/site', { asDevice: true })
      onDone()
    } catch {
      deviceToken.set(null)
      setError("Ce code n'est pas valide.")
    }
  }

  return (
    <main className="narrow stack">
      <h1>Configurer cette tablette</h1>
      <p>Saisissez le code affiché lors de l'enregistrement de la tablette.</p>
      <input value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
      {error && <p className="error">{error}</p>}
      <button onClick={save} disabled={!token.trim()}>
        Enregistrer
      </button>
    </main>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(timer)
  }, [])
  return <span>{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
}
