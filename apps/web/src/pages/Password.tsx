/**
 * The two password pages reached without being logged in:
 *   /mot-de-passe-oublie   ask for a link by e-mail
 *   /mot-de-passe?token=…  choose a password with the link received
 */
import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api.ts'
import { Logo } from './Logo.tsx'

const MIN_LENGTH = 10

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="narrow">
      <h1 className="brand-title">
        <Logo size={40} /> PLAN<span>et</span>BAO
      </h1>
      {children}
    </main>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } })
      setSent(true)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  return (
    <Frame>
      {sent ? (
        <div className="stack">
          {/* The same message whether or not the address has an account. */}
          <p>
            Si un compte existe pour <strong>{email}</strong>, un e-mail vient de lui être envoyé
            avec un lien pour choisir un nouveau mot de passe. Il est valable 1 heure.
          </p>
          <Link to="/login">Retour à la connexion</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <p>Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Recevoir le lien</button>
          <Link to="/login">Retour à la connexion</Link>
        </form>
      )}
    </Frame>
  )
}

export function SetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await api('/auth/set-password', { method: 'POST', body: { token, newPassword: password } })
      setDone(true)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  if (done) {
    return (
      <Frame>
        <div className="stack">
          <p>Votre mot de passe est enregistré.</p>
          <Link to="/login" className="button-link">
            Se connecter
          </Link>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      <form onSubmit={submit} className="stack">
        <p>Choisissez votre mot de passe.</p>
        <label>
          Mot de passe ({MIN_LENGTH} caractères au moins)
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Le même, une seconde fois
          <input
            type="password"
            autoComplete="new-password"
            required
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </label>
        {again !== '' && again !== password && (
          <p className="error">Les deux mots de passe sont différents.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={!token || password.length < MIN_LENGTH || password !== again}>
          Enregistrer mon mot de passe
        </button>
        {error && <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>}
      </form>
    </Frame>
  )
}
