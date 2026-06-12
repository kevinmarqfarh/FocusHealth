import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | working | confirm | error
  const [message, setMessage] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) return
    setStatus('working')
    setMessage('')

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (error) {
        setStatus('error')
        setMessage(error.message)
      } else if (!data.session) {
        // E-postbekräftelse är på i projektet → konto skapat, väntar på bekräftelse.
        setStatus('confirm')
      }
      // Om data.session finns loggas vi in automatiskt (onAuthStateChange tar över).
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setStatus('error')
      setMessage(
        error.message === 'Invalid login credentials'
          ? 'Fel e-post eller lösenord.'
          : error.message
      )
    }
  }

  if (status === 'confirm') {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-mark">FocusHealth</div>
          <div className="auth-sent" style={{ textAlign: 'center', marginTop: 18 }}>
            <div className="auth-sent-title">Bekräfta din e-post</div>
            <p className="muted">
              Vi skickade en bekräftelselänk till <strong>{email}</strong>. Klicka
              på den, sedan kan du logga in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-mark">FocusHealth</div>
        <div className="auth-sub">Energi &amp; mental klarhet</div>

        <form onSubmit={submit} className="auth-form">
          <label className="auth-label" htmlFor="email">
            E-post
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="du@exempel.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="auth-label" htmlFor="password" style={{ marginTop: 4 }}>
            Lösenord
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          <button type="submit" disabled={status === 'working'}>
            {status === 'working'
              ? 'Vänta…'
              : mode === 'signup'
                ? 'Skapa konto'
                : 'Logga in'}
          </button>

          {status === 'error' && <div className="auth-error">{message}</div>}

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setStatus('idle')
              setMessage('')
            }}
          >
            {mode === 'signin'
              ? 'Har du inget konto? Skapa ett'
              : 'Har du redan ett konto? Logga in'}
          </button>

          <p className="muted auth-hint">
            E-post och lösenord. Sessionen sparas på enheten — du loggas in
            automatiskt nästa gång.
          </p>
        </form>
      </div>
    </div>
  )
}
