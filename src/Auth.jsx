import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [message, setMessage] = useState('')

  async function sendLink(e) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-mark">FOCUSHEALTH</div>
        <div className="auth-sub">Energi &amp; mental klarhet</div>

        {status === 'sent' ? (
          <div className="auth-sent">
            <div className="auth-sent-title">Kolla din inkorg</div>
            <p className="muted">
              Vi skickade en inloggningslänk till <strong>{email}</strong>. Öppna
              länken på den här enheten för att logga in.
            </p>
          </div>
        ) : (
          <form onSubmit={sendLink} className="auth-form">
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
            <button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Skickar…' : 'Skicka inloggningslänk'}
            </button>
            {status === 'error' && <div className="auth-error">{message}</div>}
            <p className="muted auth-hint">
              Magic-link via e-post. Ingen lösenord behövs. Sessionen sparas på
              enheten.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
