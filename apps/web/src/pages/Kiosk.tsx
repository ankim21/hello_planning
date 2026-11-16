/**
 * The shared tablet's time clock.
 *
 * Steps: (0) one-time set-up with the tablet's code → (1) first three letters
 * of the last name → (2) pick your name → (3) PIN → (4) clock in / out / break.
 * After a clocking, or 30 seconds without a touch, it returns to step 1.
 */
import { useCallback, useEffect, useState } from 'react'
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
  const [matches, setMatches] = useState<Person[]>([])
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStep({ name: 'letters' })
    setLetters('')
    setMatches([])
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

  // Search as soon as enough letters are typed.
  useEffect(() => {
    if (letters.length < 2) {
      setMatches([])
      return
    }
    let cancelled = false
    api<Person[]>(`/kiosk/employees?prefix=${encodeURIComponent(letters)}`, { asDevice: true })
      .then((people) => !cancelled && setMatches(people))
      .catch(handleError)
    return () => {
      cancelled = true
    }
  }, [letters, handleError])

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
          <h1>Les 3 premières lettres de votre nom</h1>
          <input
            className="big"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={3}
            value={letters}
            onChange={(e) => setLetters(e.target.value.toUpperCase())}
          />
          <div className="choices">
            {matches.map((person) => (
              <button key={person.id} onClick={() => setStep({ name: 'pin', person })}>
                {person.firstName} {person.lastName}
              </button>
            ))}
          </div>
          {letters.length >= 2 && matches.length === 0 && <p className="muted">Personne trouvée.</p>}
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
