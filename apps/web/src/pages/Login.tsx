import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api.ts'
import { Logo } from './Logo.tsx'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } })
      navigate('/')
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="narrow">
      <h1 className="brand-title">
        <Logo size={40} /> PLAN<span>et</span>BAO
      </h1>
      <form onSubmit={submit} className="stack">
        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          Se connecter
        </button>
        <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </form>
    </main>
  )
}
