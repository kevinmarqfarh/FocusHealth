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
function TickMeter({ value, max }) {
  // Bezel-mätare: max ticks runt en 270°-båge, value st i guld.
  const size = 132
  const c = size / 2
  const r = 52
  const startAngle = 135
  const sweep = 270
  const ticks = Array.from({ length: max }, (_, i) => {
    const a = ((startAngle + (sweep / (max - 1)) * i) * Math.PI) / 180
    const inner = r - 9
    const outer = r
    return {
      x1: c + inner * Math.cos(a),
      y1: c + inner * Math.sin(a),
      x2: c + outer * Math.cos(a),
      y2: c + outer * Math.sin(a),
      on: i < value,
    }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="tickmeter">
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          className={t.on ? 'tick on' : 'tick'}
        />
      ))}
      <text x={c} y={c - 2} className="tick-value">
        {value}
      </text>
      <text x={c} y={c + 18} className="tick-max">
        / {max}
      </text>
    </svg>
  )
}

function Sparkline({ data, min, max, color }) {
  const w = 240
  const h = 44
  const pad = 4
  const span = max - min || 1
  const pts = data.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (data.length - 1)
    if (v == null) return null
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  // bygg segment som hoppar över null (gap)
  const segments = []
  let cur = []
  pts.forEach((p) => {
    if (p == null) {
      if (cur.length) segments.push(cur), (cur = [])
    } else cur.push(p)
  })
  if (cur.length) segments.push(cur)
  const lastIdx = [...pts].map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop()
  const last = lastIdx != null ? pts[lastIdx] : null
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline" preserveAspectRatio="none">
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {last && (
        <circle cx={last.split(',')[0]} cy={last.split(',')[1]} r="2.6" fill={color} />
      )}
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
      <button
        className="step-btn"
        onClick={() => onChange(Math.max(min, v - 1))}
        aria-label="Minska"
      >
        −
      </button>
      <div className="step-value">
        {value == null ? '–' : value}
        <span className="step-unit">bpm</span>
      </div>
      <button
        className="step-btn"
        onClick={() => onChange(Math.min(max, v + 1))}
        aria-label="Öka"
      >
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
  const passGoal = weekType === 'barn' ? 2 : 4

  // Slutförandemätare: 4 tillskott + energi + vilopuls + klarhet = 7.
  const completion =
    SUPPLEMENTS.filter((s) => day.supplements?.[s.id]).length +
    (day.energy != null ? 1 : 0) +
    (day.resting != null ? 1 : 0) +
    (day.clarity != null ? 1 : 0)

  // Pass denna vecka (Vila räknas inte).
  const weekDayKeys = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const monday = addDays(today, -(((today.getDay() + 6) % 7)))
      return dateKey(addDays(monday, i))
    })
  }, [tKey])
  const passDoneRaw = weekDayKeys.filter((k) => {
    const w = days[k]?.workout
    return w && w !== 'vila'
  }).length
  const passDone = passDoneRaw

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
  // Streak: bakåt från idag (idag räknas om påbörjad), dagar med score ≥ 5.
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const k = dateKey(addDays(today, -i))
    if (dayScore(k) >= 5) streak++
    else if (i === 0 && dayScore(k) === 0) continue // idag inte påbörjad ännu
    else break
  }

  const avg = (arr) => {
    const xs = arr.filter((v) => v != null)
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–'
  }
  const energy7 = avg(range.slice(-7).map((k) => days[k]?.energy ?? null))
  const clarity7 = avg(range.slice(-7).map((k) => days[k]?.clarity ?? null))

  const dateLabel = today.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-mark">FOCUSHEALTH</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">FOCUSHEALTH</span>
          <span className="brand-date">{dateLabel}</span>
        </div>
        <button className="signout" onClick={() => supabase.auth.signOut()}>
          Logga ut
        </button>
      </header>

      <nav className="tabs">
        <button
          className={'tab' + (view === 'idag' ? ' active' : '')}
          onClick={() => setView('idag')}
        >
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
          {/* Daglig fokusrad */}
          <section className="card focus-card span-2">
            <div className="card-kicker">Dagens fokus</div>
            <div className="focus-line">{focusLine}</div>
          </section>

          {/* Slutförande + pass */}
          <section className="card meter-card">
            <div className="card-kicker">Idag</div>
            <TickMeter value={completion} max={7} />
            <div className="meter-foot">
              <div>
                <span className="big-num">{passDone}</span>
                <span className="muted"> / {passGoal} pass</span>
              </div>
              <div className="muted small">{weekType === 'barn' ? 'Barnvecka' : 'Barnfri'}</div>
            </div>
          </section>

          {/* Veckotyp + träning */}
          <section className="card">
            <div className="card-kicker">Träning</div>
            <div className="weektype">
              <button
                className={'seg' + (weekType === 'barn' ? ' active' : '')}
                onClick={() => setWeekType('barn')}
              >
                Barnvecka · 2
              </button>
              <button
                className={'seg' + (weekType === 'barnfri' ? ' active' : '')}
                onClick={() => setWeekType('barnfri')}
              >
                Barnfri · 4
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
                    <span className={'check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>
                    <span className="supp-text">
                      <span className="supp-label">{s.label}</span>
                      <span className="supp-dose">{s.dose}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Morgon */}
          <section className="card">
            <div className="card-kicker">Morgon</div>
            <div className="field-label">Energi 1–10</div>
            <ScaleChips value={day.energy} onChange={(v) => patchDay({ energy: v })} />
            <div className="field-label mt">Vilopuls</div>
            <Stepper value={day.resting} onChange={(v) => patchDay({ resting: v })} />
          </section>

          {/* Kväll */}
          <section className="card">
            <div className="card-kicker">Kväll</div>
            <div className="field-label">Klarhet 1–10</div>
            <ScaleChips value={day.clarity} onChange={(v) => patchDay({ clarity: v })} />
          </section>
        </main>
      ) : (
        <main className="grid">
          {/* Nyckeltal */}
          <section className="card span-2">
            <div className="card-kicker">Nyckeltal</div>
            <div className="kpis">
              <div className="kpi">
                <div className="kpi-num">{streak}</div>
                <div className="kpi-label">dagar i rad</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">
                  {passDone}
                  <span className="muted">/{passGoal}</span>
                </div>
                <div className="kpi-label">pass denna vecka</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">{energy7}</div>
                <div className="kpi-label">energi 7 dgr</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">{clarity7}</div>
                <div className="kpi-label">klarhet 7 dgr</div>
              </div>
            </div>
          </section>

          {/* Sparklines */}
          <section className="card span-2">
            <div className="card-kicker">14 dagar</div>
            <div className="trend">
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#C9A227' }}>
                  Energi
                </span>
                <Sparkline data={energySeries} min={1} max={10} color="#C9A227" />
              </div>
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#9DB4C0' }}>
                  Klarhet
                </span>
                <Sparkline data={claritySeries} min={1} max={10} color="#9DB4C0" />
              </div>
              <div className="trend-row">
                <span className="trend-label" style={{ color: '#C98A8A' }}>
                  Vilopuls
                </span>
                <Sparkline data={restingSeries} min={40} max={90} color="#C98A8A" />
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

      <footer className="footer muted small">
        {session.user.email} · synkad mellan dina enheter
      </footer>
    </div>
  )
}
