import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { SUPPLEMENTS, WORKOUTS, DAILY_FOCUS, LIBRARY } from './content'

/* ---------- datum-helpers (sv-SE, lokal tid) ---------- */
function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
function last14() {
  const today = new Date()
  return Array.from({ length: 14 }, (_, i) => dateKey(addDays(today, i - 13)))
}
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

const emptyDay = () => ({
  supplements: {},
  energy: null,
  resting: null,
  clarity: null,
  workout: null,
})

/* ---------- små UI-delar ---------- */
function Sparkline({ data, min, max, color }) {
  const w = 240
  const h = 44
  const pad = 5
  const span = max - min || 1
  const pts = data.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (data.length - 1)
    if (v == null) return null
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const segments = []
  let cur = []
  pts.forEach((p) => {
    if (p == null) {
      if (cur.length) segments.push(cur), (cur = [])
    } else cur.push(p)
  })
  if (cur.length) segments.push(cur)
  const lastIdx = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop()
  const last = lastIdx != null ? pts[lastIdx] : null
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="sparkline"
      preserveAspectRatio="none"
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {last && <circle cx={last.split(',')[0]} cy={last.split(',')[1]} r="3" fill={color} />}
    </svg>
  )
}

function ScaleChips({ value, onChange }) {
  return (
    <div className="chips">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className={'chip' + (value === n ? ' active' : '')}
          onClick={() => onChange(value === n ? null : n)}
          aria-pressed={value === n}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, onChange, min = 35, max = 110 }) {
  const v = value ?? 60
  return (
    <div className="stepper">
      <button className="step-btn" onClick={() => onChange(Math.max(min, v - 1))} aria-label="Minska">
        −
      </button>
      <div className="step-value num">
        {value == null ? <span className="empty-dash">–</span> : value}
        <span className="step-unit">bpm</span>
      </div>
      <button className="step-btn" onClick={() => onChange(Math.min(max, v + 1))} aria-label="Öka">
        +
      </button>
    </div>
  )
}

function Accordion({ section, open, onToggle }) {
  return (
    <div className={'acc' + (open ? ' open' : '')}>
      <button className="acc-head" onClick={onToggle} aria-expanded={open}>
        <span>{section.title}</span>
        <span className="acc-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="acc-body">
          {section.blocks.map((b, i) => (
            <div key={i} className="block">
              <div className="block-heading">{b.heading}</div>
              <ul className="block-lines">
                {b.lines.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
              <div className="block-evidence">{b.evidence}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- huvudkomponent ---------- */
export default function FocusHealth({ session }) {
  const [view, setView] = useState('idag')
  const [days, setDays] = useState({})
  const [weeks, setWeeks] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [openSection, setOpenSection] = useState('traning')
  const persistTimers = useRef({})

  const today = useMemo(() => new Date(), [])
  const tKey = dateKey(today)
  const wKey = isoWeek(today)

  async function reload() {
    const d = await window.storage.get('fp:days')
    const w = await window.storage.get('fp:weeks')
    setDays(d ? JSON.parse(d) : {})
    setWeeks(w ? JSON.parse(w) : {})
    setLoaded(true)
  }

  useEffect(() => {
    reload()
    const onSync = () => reload()
    window.addEventListener('focushealth:synced', onSync)
    return () => window.removeEventListener('focushealth:synced', onSync)
  }, [])

  function queuePersist(key, value) {
    clearTimeout(persistTimers.current[key])
    persistTimers.current[key] = setTimeout(() => {
      window.storage.set(key, JSON.stringify(value))
    }, 120)
  }

  function patchDay(patch) {
    setDays((prev) => {
      const cur = { ...emptyDay(), ...prev[tKey] }
      const next = { ...prev, [tKey]: { ...cur, ...patch } }
      queuePersist('fp:days', next)
      return next
    })
  }

  function toggleSupplement(id) {
    setDays((prev) => {
      const cur = { ...emptyDay(), ...prev[tKey] }
      const supplements = { ...cur.supplements, [id]: !cur.supplements?.[id] }
      const next = { ...prev, [tKey]: { ...cur, supplements } }
      queuePersist('fp:days', next)
      return next
    })
  }

  function setWeekType(type) {
    setWeeks((prev) => {
      const next = { ...prev, [wKey]: { ...prev[wKey], type } }
      queuePersist('fp:weeks', next)
      return next
    })
  }

  const day = { ...emptyDay(), ...days[tKey] }
  const focusLine = DAILY_FOCUS[dayOfYear(today) % DAILY_FOCUS.length]
  const weekType = weeks[wKey]?.type || 'barnfri'
  const weekTypeLabel = weekType === 'barn' ? 'Barnvecka' : 'Barnfri'
  const passGoal = weekType === 'barn' ? 2 : 4

  // Slutförande: 4 tillskott + energi + vilopuls + klarhet = 7.
  const completion =
    SUPPLEMENTS.filter((s) => day.supplements?.[s.id]).length +
    (day.energy != null ? 1 : 0) +
    (day.resting != null ? 1 : 0) +
    (day.clarity != null ? 1 : 0)

  const weekDayKeys = useMemo(() => {
    const monday = addDays(today, -((today.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i)))
  }, [tKey])
  const passDone = weekDayKeys.filter((k) => {
    const w = days[k]?.workout
    return w && w !== 'vila'
  }).length

  /* ---- statistik för Översikt ---- */
  const range = useMemo(() => last14(), [tKey])
  const energySeries = range.map((k) => days[k]?.energy ?? null)
  const claritySeries = range.map((k) => days[k]?.clarity ?? null)
  const restingSeries = range.map((k) => days[k]?.resting ?? null)

  const dayScore = (k) => {
    const dd = days[k]
    if (!dd) return 0
    return (
      SUPPLEMENTS.filter((s) => dd.supplements?.[s.id]).length +
      (dd.energy != null ? 1 : 0) +
      (dd.resting != null ? 1 : 0) +
      (dd.clarity != null ? 1 : 0)
    )
  }
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const k = dateKey(addDays(today, -i))
    if (dayScore(k) >= 5) streak++
    else if (i === 0 && dayScore(k) === 0) continue
    else break
  }

  const avg = (arr) => {
    const xs = arr.filter((v) => v != null)
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–'
  }
  const last7 = range.slice(-7)
  const energy7 = avg(last7.map((k) => days[k]?.energy ?? null))
  const clarity7 = avg(last7.map((k) => days[k]?.clarity ?? null))
  const resting7 = avg(last7.map((k) => days[k]?.resting ?? null))

  const statVal = (v) => (v === '–' ? <span className="empty-dash">–</span> : v)

  const dateLabel = today.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-mark">FocusHealth</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">FocusHealth</span>
        </div>
        <button className="signout" onClick={() => supabase.auth.signOut()}>
          Logga ut
        </button>
      </header>

      <nav className="tabs">
        <button className={'tab' + (view === 'idag' ? ' active' : '')} onClick={() => setView('idag')}>
          Idag
        </button>
        <button
          className={'tab' + (view === 'oversikt' ? ' active' : '')}
          onClick={() => setView('oversikt')}
        >
          Översikt
        </button>
      </nav>

      {view === 'idag' ? (
        <main className="grid">
          {/* Gradient-hero */}
          <section className="hero">
            <div className="hero-kicker">{dateLabel}</div>
            <div className="hero-num">
              {completion}
              <span className="hero-den">/7</span>
            </div>
            <div className="hero-sub">uppgifter klara idag</div>
            <div className="hero-divider" />
            <div className="hero-foot">
              <div className="hero-foot-num">
                {passDone}/{passGoal}
              </div>
              <div className="hero-foot-label">pass denna vecka · {weekTypeLabel}</div>
            </div>
          </section>

          {/* Dagens fokus */}
          <section className="card span-2">
            <div className="card-kicker">Dagens fokus</div>
            <div className="focus-line">{focusLine}</div>
          </section>

          {/* Tillskott */}
          <section className="card span-2">
            <div className="card-kicker">Tillskott</div>
            <div className="supps">
              {SUPPLEMENTS.map((s) => {
                const on = !!day.supplements?.[s.id]
                return (
                  <button
                    key={s.id}
                    className={'supp' + (on ? ' on' : '')}
                    onClick={() => toggleSupplement(s.id)}
                    aria-pressed={on}
                  >
                    <span className="check">{on ? '✓' : ''}</span>
                    <span className="supp-text">
                      <span className="supp-label">{s.label}</span>
                      <span className="supp-dose">{s.dose}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Energi */}
          <section className="card">
            <div className="card-kicker">Energi · morgon</div>
            <ScaleChips value={day.energy} onChange={(v) => patchDay({ energy: v })} />
          </section>

          {/* Klarhet */}
          <section className="card">
            <div className="card-kicker">Klarhet · kväll</div>
            <ScaleChips value={day.clarity} onChange={(v) => patchDay({ clarity: v })} />
          </section>

          {/* Vilopuls */}
          <section className="card span-2">
            <div className="card-kicker">Vilopuls</div>
            <Stepper value={day.resting} onChange={(v) => patchDay({ resting: v })} />
          </section>

          {/* Träning */}
          <section className="card span-2">
            <div className="card-kicker">Träning</div>
            <div className="weektype">
              <button
                className={'seg' + (weekType === 'barn' ? ' active' : '')}
                onClick={() => setWeekType('barn')}
              >
                Barnvecka · 2 pass
              </button>
              <button
                className={'seg' + (weekType === 'barnfri' ? ' active' : '')}
                onClick={() => setWeekType('barnfri')}
              >
                Barnfri · 4 pass
              </button>
            </div>
            <div className="workout-grid">
              {WORKOUTS.map((w) => (
                <button
                  key={w.id}
                  className={'workout' + (day.workout === w.id ? ' active' : '')}
                  onClick={() => patchDay({ workout: day.workout === w.id ? null : w.id })}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="grid">
          {/* Gradient-hero: streak */}
          <section className="hero">
            <div className="hero-kicker">Översikt</div>
            <div className="hero-num">{streak}</div>
            <div className="hero-sub">dagar i rad</div>
            <div className="hero-divider" />
            <div className="hero-foot">
              <div className="hero-foot-num">
                {passDone}/{passGoal}
              </div>
              <div className="hero-foot-label">pass denna vecka</div>
            </div>
          </section>

          {/* KPI-bento */}
          <section className="card">
            <div className="kpi-num num">{statVal(energy7)}</div>
            <div className="kpi-label">energi · 7 dgr</div>
          </section>
          <section className="card">
            <div className="kpi-num num">{statVal(clarity7)}</div>
            <div className="kpi-label">klarhet · 7 dgr</div>
          </section>
          <section className="card">
            <div className="kpi-num num">
              {passDone}
              <span className="kpi-den">/{passGoal}</span>
            </div>
            <div className="kpi-label">pass denna vecka</div>
          </section>
          <section className="card">
            <div className="kpi-num num">{statVal(resting7)}</div>
            <div className="kpi-label">vilopuls · 7 dgr</div>
          </section>

          {/* Sparklines */}
          <section className="card span-2">
            <div className="card-kicker">14 dagar</div>
            <div className="trend">
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#ff4f2c' }}>
                  Energi
                </span>
                <Sparkline data={energySeries} min={1} max={10} color="#ff4f2c" />
              </div>
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#5566ff' }}>
                  Klarhet
                </span>
                <Sparkline data={claritySeries} min={1} max={10} color="#5566ff" />
              </div>
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#ff2e86' }}>
                  Vilopuls
                </span>
                <Sparkline data={restingSeries} min={40} max={90} color="#ff2e86" />
              </div>
            </div>
          </section>

          {/* Fördjupning */}
          <section className="card span-2">
            <div className="card-kicker">Fördjupning</div>
            <div className="library">
              {LIBRARY.map((sec) => (
                <Accordion
                  key={sec.id}
                  section={sec}
                  open={openSection === sec.id}
                  onToggle={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                />
              ))}
            </div>
          </section>
        </main>
      )}

      <footer className="footer">
        <span className="footer-brand">
          <span className="brand-dot" />
          FocusHealth
        </span>
        <span className="muted">{session.user.email}</span>
      </footer>
    </div>
  )
}
