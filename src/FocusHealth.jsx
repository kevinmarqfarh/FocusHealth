import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { syncFromSupabase } from './storage'
import {
  DAILY_FOCUS,
  EFFORT_LEVELS,
  EVIDENCE,
  EVIDENCE_GROUPS,
  FOOD_TIERS,
  MEAL_IDEAS,
  MEAL_PLANS,
  MEAL_TIMING,
  NUTRITION_RULES,
  QUICK_WORKOUT_TYPES,
  SHOPPING_GUIDE,
  SLEEP_PROTOCOL,
  SUPPLEMENTS,
  WORKOUT_DURATIONS,
  WORKOUTS,
} from './content'

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
function last14From(anchor) {
  return Array.from({ length: 14 }, (_, i) => dateKey(addDays(anchor, i - 13)))
}
function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}
function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
function timeMinusHours(value, hours) {
  if (!value || !value.includes(':')) return '12:30'
  const [h, m] = value.split(':').map(Number)
  const date = new Date(2026, 0, 1, h || 0, m || 0)
  date.setHours(date.getHours() - hours)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const NAV_ITEMS = [
  { id: 'idag', label: 'Idag', desc: 'Daglig cockpit' },
  { id: 'kost', label: 'Kost', desc: 'Mat, recept och inköp' },
  { id: 'naring', label: 'Näring', desc: 'Makro, vätska och tillskott' },
  { id: 'traning', label: 'Träning', desc: 'Pass, vecka och trender' },
  { id: 'somn', label: 'Sömn', desc: 'Återhämtning som prestation' },
  { id: 'profil', label: 'Profil', desc: 'Mål, längd, vikt och BMI' },
]

const DEFAULT_PROFILE = {
  goal: 'Nå bästa möjliga uthållighet och mental klarhet med elite PT-nivå.',
  heightCm: '',
  weightKg: '',
  budgetTier: 'standard',
  sleepTarget: '22:30',
  wakeTarget: '06:30',
}

const emptyDay = () => ({
  supplements: {},
  meals: {},
  shopping: {},
  sleepChecklist: {},
  energy: null,
  resting: null,
  clarity: null,
  sleepQuality: null,
  workout: null,
  workoutLogs: [],
})

const SCALE_MAX = 5
const SCALE_LABELS = ['Låg', 'Ok', 'Bra', 'Stark', 'Topp']
const WORKOUT_LOAD = {
  vila: 0,
  zon2: 2,
  styrka: 3,
  lopning: 3,
  sport: 4,
  intervaller: 5,
}

function dayWorkoutLogs(day) {
  return Array.isArray(day?.workoutLogs) ? day.workoutLogs : []
}

function dayHasWorkout(day) {
  return day?.workout != null || dayWorkoutLogs(day).length > 0
}

function dayPassCount(day) {
  const logs = dayWorkoutLogs(day)
  if (logs.length) return logs.filter((log) => log.type !== 'vila').length
  return day?.workout && day.workout !== 'vila' ? 1 : 0
}

function dayTrainingLoad(day) {
  const logs = dayWorkoutLogs(day)
  if (logs.length) {
    return Math.max(
      ...logs.map((log) => {
        const effort = Number(log.effort)
        return Number.isFinite(effort) ? Math.max(1, Math.min(5, effort)) : WORKOUT_LOAD[log.type] ?? 1
      })
    )
  }
  return day?.workout ? WORKOUT_LOAD[day.workout] ?? 1 : null
}

function countWorkoutsByType(keys, days) {
  const counts = new Map()
  keys.forEach((key) => {
    const dd = days[key]
    const logs = dayWorkoutLogs(dd)
    if (logs.length) {
      logs.forEach((log) => {
        if (!log.type || log.type === 'vila') return
        counts.set(log.type, (counts.get(log.type) || 0) + 1)
      })
      return
    }
    if (dd?.workout && dd.workout !== 'vila') {
      counts.set(dd.workout, (counts.get(dd.workout) || 0) + 1)
    }
  })
  return counts
}

function scaleValue(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.min(SCALE_MAX, n > SCALE_MAX ? Math.ceil(n / 2) : n))
}

function median(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b)
  if (!xs.length) return '–'
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid].toFixed(1) : ((xs[mid - 1] + xs[mid]) / 2).toFixed(1)
}

/* ---------- små UI-delar ---------- */
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

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
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline" preserveAspectRatio="none">
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
  const current = scaleValue(value)
  return (
    <div className="chips">
      {Array.from({ length: SCALE_MAX }, (_, i) => i + 1).map((n) => (
        <button key={n} className={'chip' + (current === n ? ' active' : '')} onClick={() => onChange(current === n ? null : n)} aria-pressed={current === n}>
          <strong>{n}</strong>
          <span>{SCALE_LABELS[n - 1]}</span>
        </button>
      ))}
    </div>
  )
}

function WeekStrip({ keys, selectedKey, todayKey, days, onSelect }) {
  return (
    <div className="week-strip">
      {keys.map((key) => {
        const d = fromDateKey(key)
        const dd = days[key] || {}
        const score =
          (scaleValue(dd.energy) != null ? 1 : 0) +
          (scaleValue(dd.clarity) != null ? 1 : 0) +
          (scaleValue(dd.sleepQuality) != null ? 1 : 0) +
          (dd.resting != null ? 1 : 0) +
          (dayHasWorkout(dd) ? 1 : 0)
        return (
          <button key={key} className={(selectedKey === key ? 'active ' : '') + (todayKey === key ? 'today' : '')} onClick={() => onSelect(key)}>
            <span>{d.toLocaleDateString('sv-SE', { weekday: 'short' }).slice(0, 2)}</span>
            <strong>{d.getDate()}</strong>
            <em>{score}/5</em>
          </button>
        )
      })}
    </div>
  )
}

function MealTimingCard({ currentMeal, onOpenFood }) {
  return (
    <div className="meal-now">
      <div>
        <span className="meal-clock">{currentMeal.window}</span>
        <strong>{currentMeal.title}</strong>
        <em>{currentMeal.cue}</em>
      </div>
      <p>{currentMeal.body}</p>
      <button className="mini-toggle" onClick={onOpenFood}>
        Kost
      </button>
    </div>
  )
}

function TrendPanel({ rows }) {
  return (
    <div className="trend compact-trend">
      {rows.map((row) => (
        <div className="trend-row" key={row.label}>
          <span className="trend-label" style={{ color: row.color }}>
            {row.label}
          </span>
          <Sparkline data={row.data} min={row.min} max={row.max} color={row.color} />
          <strong className="trend-median">{row.median}</strong>
        </div>
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

function Card({ kicker, title, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {kicker && <div className="card-kicker">{kicker}</div>}
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </section>
  )
}

function EvidenceList({ ids }) {
  const items = ids ? EVIDENCE.filter((item) => ids.includes(item.id)) : EVIDENCE
  return (
    <div className="evidence-list">
      {items.map((item) => (
        <a key={item.id} className="evidence-card" href={item.url} target="_blank" rel="noreferrer">
          <span className="evidence-area">{item.area}</span>
          <strong>{item.title}</strong>
          <span>{item.finding}</span>
          {item.takeaway && <span className="evidence-takeaway">{item.takeaway}</span>}
          {item.strength && <span className="evidence-strength">{item.strength}</span>}
          <em>{item.source}</em>
        </a>
      ))}
    </div>
  )
}

function ResearchModule({ ids }) {
  const items = ids ? EVIDENCE.filter((item) => ids.includes(item.id)) : EVIDENCE
  return (
    <div className="research-module">
      <div className="research-tldr">
        {items.slice(0, 4).map((item) => (
          <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
            <span>{item.strength}</span>
            <strong>{item.title}</strong>
            <em>{item.takeaway || item.finding}</em>
          </a>
        ))}
      </div>
      <EvidenceList ids={ids} />
    </div>
  )
}

function ShoppingGuide({ groups, checked = {}, onToggle }) {
  return (
    <div className="shopping-guide">
      {groups.map((group) => (
        <section key={group.category} className="shopping-group">
          <div className="shopping-head">
            <strong>{group.category}</strong>
            <span>{group.why}</span>
          </div>
          <div className="shopping-items">
            {group.items.map((item) => {
              const id = `${group.category}:${item}`
              const on = !!checked[id]
              return (
                <button key={id} className={'shopping-item' + (on ? ' active' : '')} onClick={() => onToggle(id)} aria-pressed={on}>
                  <span className="check">{on ? '✓' : ''}</span>
                  <span>{item}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function workoutLabel(type) {
  return WORKOUTS.find((workout) => workout.id === type)?.label || 'Pass'
}

function QuickWorkoutLogger({ value, logs = [], compact = false, onChange, onSave, onRemove }) {
  const selectedType = value.type || 'styrka'
  const duration = value.duration || 60
  const effort = value.effort || 3
  const recent = logs.slice(0, compact ? 1 : 4)
  return (
    <div className={'quick-workout' + (compact ? ' compact' : '')}>
      <div className="quick-workout-head">
        <strong>{compact ? 'Snabblogg' : 'Logga pass direkt'}</strong>
        <span>Synkas till samma konto på iPhone, iPad och PC.</span>
      </div>

      <div className="quick-workout-types" aria-label="Välj passtyp">
        {QUICK_WORKOUT_TYPES.map((type) => (
          <button key={type.id} className={selectedType === type.id ? 'active' : ''} onClick={() => onChange({ type: type.id })} aria-pressed={selectedType === type.id}>
            {type.label}
          </button>
        ))}
      </div>

      <div className="quick-workout-controls">
        <div className="quick-control">
          <span>Min</span>
          <div className="quick-chip-row">
            {WORKOUT_DURATIONS.map((minutes) => (
              <button key={minutes} className={duration === minutes ? 'active' : ''} onClick={() => onChange({ duration: minutes })} aria-pressed={duration === minutes}>
                {minutes}
              </button>
            ))}
          </div>
        </div>
        <div className="quick-control">
          <span>RPE</span>
          <div className="quick-chip-row effort">
            {EFFORT_LEVELS.map((level) => (
              <button key={level.value} className={effort === level.value ? 'active' : ''} onClick={() => onChange({ effort: level.value })} aria-pressed={effort === level.value}>
                {level.value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!compact && (
        <label className="field quick-note">
          <span>Kort notis</span>
          <input
            type="text"
            inputMode="text"
            value={value.note || ''}
            maxLength="80"
            placeholder="t.ex. ben, rygg, lugnt, PR-känsla"
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </label>
      )}

      <button className="quick-save" onClick={onSave}>
        Logga {workoutLabel(selectedType)} · {duration} min · RPE {effort}
      </button>

      {recent.length > 0 && (
        <div className="recent-workouts">
          {recent.map((log) => (
            <div key={log.id} className="recent-workout">
              <div>
                <strong>{workoutLabel(log.type)}</strong>
                <span>
                  {log.time || 'Nu'} · {log.duration || duration} min · RPE {log.effort || effort}
                </span>
                {log.note && <em>{log.note}</em>}
              </div>
              {!compact && (
                <button onClick={() => onRemove(log.id)} aria-label={`Ta bort ${workoutLabel(log.type)}`}>
                  Ta bort
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SyncPanel({ email, isOnline, syncing, syncTime, onSyncNow, compact = false }) {
  return (
    <div className={'sync-panel' + (compact ? ' compact' : '')}>
      <div>
        <span className={'sync-dot' + (isOnline ? ' online' : '')} />
        <span className="sync-state">{isOnline ? 'Synk aktiv' : 'Offline'}</span>
      </div>
      <strong>{isOnline ? 'Samma konto på iPhone, iPad och PC' : 'Sparar lokalt'}</strong>
      <em>{isOnline ? `Senast uppdaterad ${syncTime}` : 'Skickas när nätet är tillbaka'}</em>
      {email && <span className="sync-email">{email}</span>}
      <button className="sync-action" onClick={onSyncNow} disabled={syncing}>
        {syncing ? 'Synkar' : 'Synka nu'}
      </button>
    </div>
  )
}

function DesktopRail({ activeView, onChooseView, email, isOnline, syncing, syncTime, onSyncNow, onSignOut }) {
  return (
    <aside className="desktop-rail" aria-label="PC-administration">
      <div className="rail-brand">
        <span className="brand-dot" />
        <div>
          <strong>FocusHealth</strong>
          <span>Elite PT-system</span>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Huvudvy">
        {NAV_ITEMS.map((item) => (
          <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => onChooseView(item.id)}>
            <span>{item.label}</span>
            <em>{item.desc}</em>
          </button>
        ))}
      </nav>

      <div className="rail-admin">
        <div className="rail-label">Enheter</div>
        <SyncPanel email={email} isOnline={isOnline} syncing={syncing} syncTime={syncTime} onSyncNow={onSyncNow} compact />
        <button className="signout rail-signout" onClick={onSignOut}>
          Logga ut
        </button>
      </div>
    </aside>
  )
}

function bmiBand(value) {
  if (value == null) return 'Lägg in längd och vikt'
  if (value < 18.5) return 'Under referens'
  if (value < 25) return 'Referensintervall'
  if (value < 30) return 'Över referens'
  return 'Högt intervall'
}

/* ---------- huvudkomponent ---------- */
export default function FocusHealth({ session }) {
  const [view, setView] = useState('idag')
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()))
  const [menuOpen, setMenuOpen] = useState(false)
  const [days, setDays] = useState({})
  const [weeks, setWeeks] = useState({})
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [loaded, setLoaded] = useState(false)
  const [syncStamp, setSyncStamp] = useState(() => new Date())
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [quickWorkout, setQuickWorkout] = useState({ type: 'styrka', duration: 60, effort: 3, note: '' })
  const persistTimers = useRef({})
  const syncingRef = useRef(false)

  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const selectedDate = useMemo(() => fromDateKey(selectedKey), [selectedKey])
  const tKey = selectedKey
  const wKey = isoWeek(selectedDate)

  async function reload() {
    const d = await window.storage.get('fp:days')
    const w = await window.storage.get('fp:weeks')
    const p = await window.storage.get('fp:profile')
    setDays(parseJson(d, {}))
    setWeeks(parseJson(w, {}))
    setProfile({ ...DEFAULT_PROFILE, ...parseJson(p, {}) })
    setSyncStamp(new Date())
    setLoaded(true)
  }

  useEffect(() => {
    reload()
    const onSync = () => reload()
    window.addEventListener('focushealth:synced', onSync)
    return () => window.removeEventListener('focushealth:synced', onSync)
  }, [])

  useEffect(() => {
    const markOnline = () => {
      setIsOnline(true)
      runSync()
    }
    const markOffline = () => setIsOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  useEffect(() => {
    const syncWhenVisible = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      runSync()
    }
    window.addEventListener('focus', syncWhenVisible)
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      window.removeEventListener('focus', syncWhenVisible)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [])

  function queuePersist(key, value) {
    setSyncStamp(new Date())
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

  function patchProfile(patch) {
    setProfile((prev) => {
      const next = { ...prev, ...patch }
      queuePersist('fp:profile', next)
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

  function toggleNested(key, id) {
    setDays((prev) => {
      const cur = { ...emptyDay(), ...prev[tKey] }
      const nextGroup = { ...(cur[key] || {}), [id]: !cur[key]?.[id] }
      const next = { ...prev, [tKey]: { ...cur, [key]: nextGroup } }
      queuePersist('fp:days', next)
      return next
    })
  }

  function patchQuickWorkout(patch) {
    setQuickWorkout((prev) => ({ ...prev, ...patch }))
  }

  function persistDaysNow(next) {
    setSyncStamp(new Date())
    clearTimeout(persistTimers.current['fp:days'])
    window.storage.set('fp:days', JSON.stringify(next))
  }

  function addWorkoutLog() {
    const now = new Date()
    const log = {
      id: `${now.getTime()}`,
      type: quickWorkout.type || 'styrka',
      duration: quickWorkout.duration || 60,
      effort: quickWorkout.effort || 3,
      note: (quickWorkout.note || '').trim(),
      time: now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString(),
    }
    setDays((prev) => {
      const cur = { ...emptyDay(), ...prev[tKey] }
      const workoutLogs = [log, ...dayWorkoutLogs(cur)].slice(0, 12)
      const next = { ...prev, [tKey]: { ...cur, workout: log.type, workoutLogs } }
      persistDaysNow(next)
      return next
    })
    setQuickWorkout((prev) => ({ ...prev, note: '' }))
  }

  function removeWorkoutLog(id) {
    setDays((prev) => {
      const cur = { ...emptyDay(), ...prev[tKey] }
      const workoutLogs = dayWorkoutLogs(cur).filter((log) => log.id !== id)
      const nextWorkout = workoutLogs[0]?.type || null
      const next = { ...prev, [tKey]: { ...cur, workout: nextWorkout, workoutLogs } }
      persistDaysNow(next)
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

  function chooseView(nextView) {
    setView(nextView)
    setMenuOpen(false)
  }

  async function runSync() {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await syncFromSupabase()
      await reload()
      setSyncStamp(new Date())
    } finally {
      setSyncing(false)
      syncingRef.current = false
    }
  }

  function handleSyncNow() {
    runSync()
  }

  const day = { ...emptyDay(), ...days[tKey] }
  const selectedWorkoutLogs = dayWorkoutLogs(day)
  const focusLine = DAILY_FOCUS[dayOfYear(selectedDate) % DAILY_FOCUS.length]
  const weekType = weeks[wKey]?.type || 'barnfri'
  const weekTypeLabel = weekType === 'barn' ? 'Barnvecka' : 'Barnfri'
  const passGoal = weekType === 'barn' ? 2 : 4
  const completion =
    (scaleValue(day.energy) != null ? 1 : 0) +
    (scaleValue(day.clarity) != null ? 1 : 0) +
    (scaleValue(day.sleepQuality) != null ? 1 : 0) +
    (day.resting != null ? 1 : 0) +
    (dayHasWorkout(day) ? 1 : 0)

  const weekDayKeys = useMemo(() => {
    const monday = addDays(selectedDate, -((selectedDate.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i)))
  }, [selectedKey])
  const passDone = weekDayKeys.reduce((sum, k) => sum + dayPassCount(days[k]), 0)

  const range = useMemo(() => last14From(selectedDate), [selectedKey])
  const energySeries = range.map((k) => scaleValue(days[k]?.energy))
  const claritySeries = range.map((k) => scaleValue(days[k]?.clarity))
  const restingSeries = range.map((k) => days[k]?.resting ?? null)
  const sleepSeries = range.map((k) => scaleValue(days[k]?.sleepQuality))
  const loadSeries = range.map((k) => dayTrainingLoad(days[k]))

  const dayScore = (k) => {
    const dd = days[k]
    if (!dd) return 0
    return (
      (scaleValue(dd.energy) != null ? 1 : 0) +
      (scaleValue(dd.clarity) != null ? 1 : 0) +
      (scaleValue(dd.sleepQuality) != null ? 1 : 0) +
      (dd.resting != null ? 1 : 0) +
      (dayHasWorkout(dd) ? 1 : 0)
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
  const energy7 = avg(last7.map((k) => scaleValue(days[k]?.energy)))
  const clarity7 = avg(last7.map((k) => scaleValue(days[k]?.clarity)))
  const resting7 = avg(last7.map((k) => days[k]?.resting ?? null))
  const sleep7 = avg(last7.map((k) => scaleValue(days[k]?.sleepQuality)))
  const weekEnergyMedian = median(weekDayKeys.map((k) => scaleValue(days[k]?.energy)))
  const weekClarityMedian = median(weekDayKeys.map((k) => scaleValue(days[k]?.clarity)))
  const weekSleepMedian = median(weekDayKeys.map((k) => scaleValue(days[k]?.sleepQuality)))
  const weekRestingMedian = median(weekDayKeys.map((k) => days[k]?.resting ?? null))
  const weekLoadMedian = median(weekDayKeys.map((k) => dayTrainingLoad(days[k])))
  const workoutCountMap = countWorkoutsByType(weekDayKeys, days)
  const workoutCounts = WORKOUTS.map((workout) => ({
    ...workout,
    count: workoutCountMap.get(workout.id) || 0,
  })).filter((workout) => workout.count > 0)
  const weekMealLogs = weekDayKeys.reduce((sum, key) => {
    const meals = days[key]?.meals || {}
    return sum + MEAL_PLANS.filter((meal) => meals[meal.id]).length
  }, 0)
  const weekProteinDays = weekDayKeys.filter((key) => days[key]?.meals?.proteinBase).length
  const statVal = (v) => (v === '–' ? <span className="empty-dash">–</span> : v)

  const height = Number(profile.heightCm)
  const weight = Number(profile.weightKg)
  const validBody = height >= 120 && height <= 230 && weight >= 35 && weight <= 250
  const bmi = validBody ? Number((weight / (height / 100) ** 2).toFixed(1)) : null
  const selectedTier = FOOD_TIERS.find((tier) => tier.id === profile.budgetTier) || FOOD_TIERS[1]
  const selectedShoppingGuide = SHOPPING_GUIDE[selectedTier.id] || SHOPPING_GUIDE.standard
  const proteinTarget = weight >= 35 && weight <= 250 ? `${Math.round(weight * 1.6)}-${Math.round(weight * 2.2)} g` : 'ange vikt'
  const caffeineCutoff = timeMinusHours(profile.sleepTarget, 10)
  const activeLabel = NAV_ITEMS.find((item) => item.id === view)?.label || 'Idag'
  const syncTime = syncStamp.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const accountEmail = session.user.email || 'Konto'

  const dateLabel = selectedDate.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const hourNow = today.getHours() + today.getMinutes() / 60
  const activeMeal =
    MEAL_TIMING.find((meal) => hourNow >= meal.start && hourNow < meal.end) ||
    (hourNow < MEAL_TIMING[0].start ? MEAL_TIMING[0] : MEAL_TIMING[MEAL_TIMING.length - 1])
  const currentMeal = {
    ...activeMeal,
    window: `${String(Math.floor(activeMeal.start)).padStart(2, '0')}:${activeMeal.start % 1 ? '30' : '00'}-${String(Math.floor(activeMeal.end)).padStart(2, '0')}:${activeMeal.end % 1 ? '30' : '00'}`,
  }

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-mark">FocusHealth</div>
      </div>
    )
  }

  const renderToday = () => (
    <main className="grid today-grid">
      <section className="hero today-hero">
        <div className="hero-kicker">{dateLabel}</div>
        <div className="hero-num">
          {completion}
          <span className="hero-den">/5</span>
        </div>
        <div className="hero-sub">dagliga datapunkter loggade</div>
        <div className="hero-divider" />
        <div className="hero-foot">
          <div className="hero-foot-num">
            {passDone}/{passGoal}
          </div>
          <div className="hero-foot-label">pass denna vecka · {weekTypeLabel}</div>
        </div>
      </section>

      <Card kicker="Vecka" className="week-card span-2">
        <WeekStrip keys={weekDayKeys} selectedKey={selectedKey} todayKey={todayKey} days={days} onSelect={setSelectedKey} />
      </Card>

      <Card kicker="Träning" className="today-workout">
        <QuickWorkoutLogger
          value={quickWorkout}
          logs={selectedWorkoutLogs}
          compact
          onChange={patchQuickWorkout}
          onSave={addWorkoutLog}
          onRemove={removeWorkoutLog}
        />
      </Card>

      <Card kicker="Kostsignal" className="meal-card">
        <MealTimingCard currentMeal={currentMeal} onOpenFood={() => chooseView('kost')} />
      </Card>

      <Card kicker="Dagsform" className="daily-scales span-2">
        <div className="scale-row">
          <span>Energi</span>
          <ScaleChips value={day.energy} onChange={(v) => patchDay({ energy: v })} />
        </div>
        <div className="scale-row">
          <span>Klarhet</span>
          <ScaleChips value={day.clarity} onChange={(v) => patchDay({ clarity: v })} />
        </div>
        <div className="scale-row">
          <span>Sömn</span>
          <ScaleChips value={day.sleepQuality} onChange={(v) => patchDay({ sleepQuality: v })} />
        </div>
      </Card>

      <Card kicker="Vilopuls" className="pulse-card">
        <Stepper value={day.resting} onChange={(v) => patchDay({ resting: v })} />
      </Card>

      <Card kicker="Veckomål" className="week-goal-card">
        <div className="weektype">
          <button className={'seg' + (weekType === 'barn' ? ' active' : '')} onClick={() => setWeekType('barn')}>
            Barnvecka · 2 pass
          </button>
          <button className={'seg' + (weekType === 'barnfri' ? ' active' : '')} onClick={() => setWeekType('barnfri')}>
            Barnfri · 4 pass
          </button>
        </div>
        <p className="body-copy small-note">Median vecka: energi {weekEnergyMedian}, klarhet {weekClarityMedian}, sömn {weekSleepMedian}.</p>
      </Card>

      <Card kicker="Fokus" className="home-optional span-2">
        <div className="focus-line">{focusLine}</div>
      </Card>

      <Card kicker="Tillskott" className="home-optional span-2">
        <div className="supps compact">
          {SUPPLEMENTS.map((s) => {
            const on = !!day.supplements?.[s.id]
            return (
              <button key={s.id} className={'supp' + (on ? ' on' : '')} onClick={() => toggleSupplement(s.id)} aria-pressed={on}>
                <span className="check">{on ? '✓' : ''}</span>
                <span className="supp-text">
                  <span className="supp-label">{s.label}</span>
                  <span className="supp-dose">{s.dose}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Card>
    </main>
  )

  const renderOverview = () => (
    <main className="grid">
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

      <Card>
        <div className="kpi-num num">{statVal(energy7)}</div>
        <div className="kpi-label">energi · 7 dgr</div>
      </Card>
      <Card>
        <div className="kpi-num num">{statVal(clarity7)}</div>
        <div className="kpi-label">klarhet · 7 dgr</div>
      </Card>
      <Card>
        <div className="kpi-num num">
          {passDone}
          <span className="kpi-den">/{passGoal}</span>
        </div>
        <div className="kpi-label">pass denna vecka</div>
      </Card>
      <Card>
        <div className="kpi-num num">{statVal(resting7)}</div>
        <div className="kpi-label">vilopuls · 7 dgr</div>
      </Card>
      <Card>
        <div className="kpi-num num">{statVal(sleep7)}</div>
        <div className="kpi-label">sömnkvalitet · 7 dgr</div>
      </Card>
      <Card>
        <div className="kpi-num num">{bmi ?? '–'}</div>
        <div className="kpi-label">BMI · profil</div>
      </Card>

      <Card kicker="14 dagar" className="span-2">
        <div className="trend">
          <div className="trend-row">
            <span className="trend-label" style={{ color: '#c84a31' }}>
              Energi
            </span>
            <Sparkline data={energySeries} min={1} max={10} color="#c84a31" />
          </div>
          <div className="trend-row">
            <span className="trend-label" style={{ color: '#345bd8' }}>
              Klarhet
            </span>
            <Sparkline data={claritySeries} min={1} max={10} color="#345bd8" />
          </div>
          <div className="trend-row">
            <span className="trend-label" style={{ color: '#d2547b' }}>
              Vilopuls
            </span>
            <Sparkline data={restingSeries} min={40} max={90} color="#d2547b" />
          </div>
          <div className="trend-row">
            <span className="trend-label" style={{ color: '#2f7d5a' }}>
              Sömn
            </span>
            <Sparkline data={sleepSeries} min={1} max={10} color="#2f7d5a" />
          </div>
        </div>
      </Card>

      <Card kicker="Evidensbas" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.overview} />
      </Card>
    </main>
  )

  const renderTraining = () => (
    <main className="grid">
      <section className="hero quiet-hero">
        <div className="hero-kicker">Träning</div>
        <div className="hero-num compact">
          {passDone}
          <span className="hero-den">/{passGoal}</span>
        </div>
        <div className="hero-sub">pass denna vecka · medianbelastning {weekLoadMedian}/5</div>
      </section>

      <Card kicker="Vecka" className="span-2">
        <WeekStrip keys={weekDayKeys} selectedKey={selectedKey} todayKey={todayKey} days={days} onSelect={setSelectedKey} />
      </Card>

      <Card kicker={dateLabel} title="Snabb passlogg" className="span-2">
        <QuickWorkoutLogger
          value={quickWorkout}
          logs={selectedWorkoutLogs}
          onChange={patchQuickWorkout}
          onSave={addWorkoutLog}
          onRemove={removeWorkoutLog}
        />
      </Card>

      <Card kicker="Veckotyp" title={weekTypeLabel}>
        <div className="weektype stacked">
          <button className={'seg' + (weekType === 'barn' ? ' active' : '')} onClick={() => setWeekType('barn')}>
            Barnvecka · 2 pass
          </button>
          <button className={'seg' + (weekType === 'barnfri' ? ' active' : '')} onClick={() => setWeekType('barnfri')}>
            Barnfri · 4 pass
          </button>
        </div>
        <p className="body-copy small-note">Välj efter verklig vecka. Målet styr bara veckans enkla passindikator.</p>
      </Card>

      <Card kicker="Medianer" className="span-2">
        <div className="metric-grid">
          <div>
            <span>Energi</span>
            <strong>{weekEnergyMedian}</strong>
          </div>
          <div>
            <span>Klarhet</span>
            <strong>{weekClarityMedian}</strong>
          </div>
          <div>
            <span>Sömn</span>
            <strong>{weekSleepMedian}</strong>
          </div>
          <div>
            <span>Vilopuls</span>
            <strong>{weekRestingMedian}</strong>
          </div>
        </div>
      </Card>

      <Card kicker="14 dagar" className="span-2">
        <TrendPanel
          rows={[
            { label: 'Belastning', data: loadSeries, min: 0, max: 5, color: '#17191e', median: weekLoadMedian },
            { label: 'Energi', data: energySeries, min: 1, max: 5, color: '#c84a31', median: weekEnergyMedian },
            { label: 'Klarhet', data: claritySeries, min: 1, max: 5, color: '#345bd8', median: weekClarityMedian },
            { label: 'Vilopuls', data: restingSeries, min: 40, max: 90, color: '#d2547b', median: weekRestingMedian },
          ]}
        />
      </Card>

      <Card kicker="Fördelning">
        <div className="distribution">
          {(workoutCounts.length ? workoutCounts : [{ id: 'none', label: 'Inga pass', count: 0 }]).map((item) => (
            <div key={item.id} className="distribution-row">
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card kicker="Princip" title="Bas först, topp sen">
        <p className="body-copy">Håll majoriteten lugn, lägg hårda pass när sömn och energi stödjer det, och använd vilodagar som faktisk adaptation.</p>
      </Card>

      <Card kicker="Forskning · TLDR" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.overview} />
      </Card>
    </main>
  )

  const renderFood = () => (
    <main className="grid">
      <section className="hero quiet-hero">
        <div className="hero-kicker">Kost</div>
        <div className="hero-title">Ät för uthållighet och skärpa.</div>
        <div className="hero-sub">Målet: {profile.goal}</div>
      </section>

      <Card kicker="Måltidstider" className="span-2">
        <div className="timing-grid">
          {MEAL_TIMING.map((meal) => (
            <div key={meal.id} className="timing-item">
              <span>
                {String(Math.floor(meal.start)).padStart(2, '0')}:{meal.start % 1 ? '30' : '00'}-
                {String(Math.floor(meal.end)).padStart(2, '0')}:{meal.end % 1 ? '30' : '00'}
              </span>
              <strong>{meal.title}</strong>
              <em>{meal.cue}</em>
            </div>
          ))}
        </div>
      </Card>

      <Card kicker="Tips per måltid" className="span-2">
        <div className="meal-ideas-grid">
          {MEAL_IDEAS.map((meal) => (
            <section key={meal.id} className="meal-idea">
              <span>{meal.time}</span>
              <strong>{meal.title}</strong>
              <em>{meal.goal}</em>
              <ul>
                {meal.ideas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      <Card kicker="Prisnivå" className="span-2">
        <div className="tier-tabs">
          {FOOD_TIERS.map((tier) => (
            <button key={tier.id} className={'tier-tab' + (selectedTier.id === tier.id ? ' active' : '')} onClick={() => patchProfile({ budgetTier: tier.id })}>
              <span>{tier.label}</span>
              <em>{tier.price}</em>
            </button>
          ))}
        </div>
      </Card>

      <Card kicker={selectedTier.label} title={selectedTier.focus}>
        <ul className="clean-list">
          {selectedTier.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card kicker="Inköp" title={`Optimerad lista · ${selectedTier.label}`} className="span-2">
        <ShoppingGuide groups={selectedShoppingGuide} checked={day.shopping} onToggle={(id) => toggleNested('shopping', id)} />
      </Card>

      <Card kicker="Dagens matmål">
        <div className="goal-stack">
          <label className="check-row">
            <input type="checkbox" checked={!!day.meals?.proteinBase} onChange={() => toggleNested('meals', 'proteinBase')} />
            <span>Protein i varje huvudmål</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!day.meals?.walkLunch} onChange={() => toggleNested('meals', 'walkLunch')} />
            <span>10 min promenad efter lunch</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!day.meals?.plants} onChange={() => toggleNested('meals', 'plants')} />
            <span>Minst tre färger från växtriket</span>
          </label>
        </div>
      </Card>

      <Card kicker="Veckodata" className="span-2">
        <div className="metric-grid">
          <div>
            <span>Måltider</span>
            <strong>{weekMealLogs}/28</strong>
          </div>
          <div>
            <span>Proteindagar</span>
            <strong>{weekProteinDays}/7</strong>
          </div>
          <div>
            <span>Energi median</span>
            <strong>{weekEnergyMedian}</strong>
          </div>
          <div>
            <span>Klarhet median</span>
            <strong>{weekClarityMedian}</strong>
          </div>
        </div>
      </Card>

      {MEAL_PLANS.map((meal) => (
        <Card key={meal.id} kicker={meal.timing} title={meal.title}>
          <p className="body-copy strong">{meal.recipe}</p>
          <p className="body-copy">{meal.budget}</p>
          <div className="meal-footer">
            <span>{meal.goal}</span>
            <button className={'mini-toggle' + (day.meals?.[meal.id] ? ' active' : '')} onClick={() => toggleNested('meals', meal.id)}>
              {day.meals?.[meal.id] ? 'Klar' : 'Logga'}
            </button>
          </div>
        </Card>
      ))}

      <Card kicker="Forskning · TLDR" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.food} />
      </Card>
    </main>
  )

  const renderNutrition = () => (
    <main className="grid">
      <section className="hero quiet-hero">
        <div className="hero-kicker">Näring</div>
        <div className="hero-num compact">{proteinTarget}</div>
        <div className="hero-sub">proteinmål per dag baserat på profilvikt</div>
      </section>

      {NUTRITION_RULES.map((rule) => (
        <Card key={rule.title} kicker={rule.metric} title={rule.title}>
          <p className="body-copy">{rule.body}</p>
        </Card>
      ))}

      <Card kicker="Tillskott" className="span-2">
        <div className="supps">
          {SUPPLEMENTS.map((s) => {
            const on = !!day.supplements?.[s.id]
            return (
              <button key={s.id} className={'supp' + (on ? ' on' : '')} onClick={() => toggleSupplement(s.id)} aria-pressed={on}>
                <span className="check">{on ? '✓' : ''}</span>
                <span className="supp-text">
                  <span className="supp-label">{s.label}</span>
                  <span className="supp-dose">{s.dose}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card kicker="14 dagar" className="span-2">
        <TrendPanel
          rows={[
            { label: 'Energi', data: energySeries, min: 1, max: 5, color: '#c84a31', median: weekEnergyMedian },
            { label: 'Klarhet', data: claritySeries, min: 1, max: 5, color: '#345bd8', median: weekClarityMedian },
            { label: 'Sömn', data: sleepSeries, min: 1, max: 5, color: '#2f7d5a', median: weekSleepMedian },
          ]}
        />
      </Card>

      <Card kicker="Forskning · TLDR" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.nutrition} />
      </Card>
    </main>
  )

  const renderSleep = () => (
    <main className="grid">
      <section className="hero quiet-hero">
        <div className="hero-kicker">Sömn</div>
        <div className="hero-num compact">
          {profile.sleepTarget}
          <span className="hero-den">-{profile.wakeTarget}</span>
        </div>
        <div className="hero-sub">koffeinstopp runt {caffeineCutoff}</div>
      </section>

      <Card kicker="Sömnkvalitet" className="span-2">
        <ScaleChips value={day.sleepQuality} onChange={(v) => patchDay({ sleepQuality: v })} />
      </Card>

      {SLEEP_PROTOCOL.map((step) => (
        <Card key={step.title} title={step.title}>
          <p className="body-copy">{step.body}</p>
          <button className={'mini-toggle' + (day.sleepChecklist?.[step.title] ? ' active' : '')} onClick={() => toggleNested('sleepChecklist', step.title)}>
            {day.sleepChecklist?.[step.title] ? 'Klar' : 'Markera'}
          </button>
        </Card>
      ))}

      <Card kicker="Sömnfönster" className="span-2">
        <div className="form-grid two">
          <label className="field">
            <span>Läggtid</span>
            <input type="time" value={profile.sleepTarget} onChange={(e) => patchProfile({ sleepTarget: e.target.value })} />
          </label>
          <label className="field">
            <span>Uppstigning</span>
            <input type="time" value={profile.wakeTarget} onChange={(e) => patchProfile({ wakeTarget: e.target.value })} />
          </label>
        </div>
      </Card>

      <Card kicker="Forskning · TLDR" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.sleep} />
      </Card>
    </main>
  )

  const renderProfile = () => (
    <main className="grid">
      <section className="hero quiet-hero">
        <div className="hero-kicker">Profil</div>
        <div className="hero-num compact">{bmi ?? '–'}</div>
        <div className="hero-sub">BMI · {bmiBand(bmi)}</div>
      </section>

      <Card kicker="Mål" className="span-2">
        <label className="field">
          <span>Personligt mål</span>
          <textarea value={profile.goal} onChange={(e) => patchProfile({ goal: e.target.value })} rows="3" />
        </label>
      </Card>

      <Card kicker="Kropp">
        <div className="form-grid">
          <label className="field">
            <span>Längd · cm</span>
            <input type="number" inputMode="decimal" min="120" max="230" value={profile.heightCm} onChange={(e) => patchProfile({ heightCm: e.target.value })} />
          </label>
          <label className="field">
            <span>Vikt · kg</span>
            <input type="number" inputMode="decimal" min="35" max="250" value={profile.weightKg} onChange={(e) => patchProfile({ weightKg: e.target.value })} />
          </label>
        </div>
      </Card>

      <Card kicker="BMI">
        <div className="mini-metric large">
          <span>Beräknat värde</span>
          <strong className="num">{bmi ?? '–'}</strong>
          <em>{bmiBand(bmi)}</em>
        </div>
        <p className="body-copy small-note">BMI är ett grovt screeningmått. Följ även vilopuls, ork, styrka, sömn och midjemått.</p>
      </Card>

      <Card kicker="Kostbudget" className="span-2">
        <div className="tier-tabs">
          {FOOD_TIERS.map((tier) => (
            <button key={tier.id} className={'tier-tab' + (selectedTier.id === tier.id ? ' active' : '')} onClick={() => patchProfile({ budgetTier: tier.id })}>
              <span>{tier.label}</span>
              <em>{tier.price}</em>
            </button>
          ))}
        </div>
      </Card>

      <Card kicker="Konto" className="span-2">
        <div className="account-row with-sync">
          <span>{accountEmail}</span>
          <SyncPanel email="" isOnline={isOnline} syncing={syncing} syncTime={syncTime} onSyncNow={handleSyncNow} />
          <button className="signout inline" onClick={() => supabase.auth.signOut()}>
            Logga ut
          </button>
        </div>
      </Card>

      <Card kicker="Forskning · TLDR" className="span-2">
        <ResearchModule ids={EVIDENCE_GROUPS.profile} />
      </Card>
    </main>
  )

  const renderView = () => {
    if (view === 'kost') return renderFood()
    if (view === 'naring') return renderNutrition()
    if (view === 'traning') return renderTraining()
    if (view === 'somn') return renderSleep()
    if (view === 'profil') return renderProfile()
    return renderToday()
  }

  return (
    <div className="app-frame">
      <DesktopRail
        activeView={view}
        onChooseView={chooseView}
        email={accountEmail}
        isOnline={isOnline}
        syncing={syncing}
        syncTime={syncTime}
        onSyncNow={handleSyncNow}
        onSignOut={() => supabase.auth.signOut()}
      />

      <div className="app">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Öppna meny" aria-expanded={menuOpen}>
            <MenuIcon />
          </button>
          <div className="brand">
            <span className="brand-dot" />
            <span className="brand-name">FocusHealth</span>
          </div>
          <button className="top-metric" onClick={() => chooseView('profil')}>
            <span>BMI</span>
            <strong>{bmi ?? '–'}</strong>
          </button>
        </header>

        <div className="page-head">
          <div>
            <div className="page-kicker">Elite PT-system</div>
            <h1>{activeLabel}</h1>
          </div>
          <button className="date-return" onClick={() => setSelectedKey(todayKey)}>
            {selectedKey === todayKey ? 'Idag' : 'Till idag'}
          </button>
        </div>

        {menuOpen && (
          <div className="drawer-layer">
            <button className="drawer-backdrop" aria-label="Stäng meny" onClick={() => setMenuOpen(false)} />
            <aside className="drawer" aria-label="Huvudmeny">
              <div className="drawer-head">
                <div className="brand">
                  <span className="brand-dot" />
                  <span className="brand-name">FocusHealth</span>
                </div>
                <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Stäng meny">
                  ×
                </button>
              </div>
              <nav className="drawer-nav">
                {NAV_ITEMS.map((item) => (
                  <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => chooseView(item.id)}>
                    <span>{item.label}</span>
                    <em>{item.desc}</em>
                  </button>
                ))}
              </nav>
              <div className="drawer-foot">
                <span>{accountEmail}</span>
                <SyncPanel email="" isOnline={isOnline} syncing={syncing} syncTime={syncTime} onSyncNow={handleSyncNow} compact />
                <button className="signout" onClick={() => supabase.auth.signOut()}>
                  Logga ut
                </button>
              </div>
            </aside>
          </div>
        )}

        {renderView()}

        <footer className="footer">
          <span className="footer-brand">
            <span className="brand-dot" />
            FocusHealth
          </span>
          <span className="muted">{activeLabel}</span>
        </footer>
      </div>
    </div>
  )
}
