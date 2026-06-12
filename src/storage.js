// Adapterlager: behåller exakt samma async-API som det gamla window.storage
// (get/set/delete/list) men lagrar i Supabase och cachar i localStorage.
//
// Strategi:
//  - Write-through: set() skriver direkt till localStorage (omedelbar UI + offline)
//    och upsertar sedan till focushealth_kv i bakgrunden.
//  - get() returnerar cache-värdet direkt och uppdaterar från Supabase i bakgrunden.
//  - syncFromSupabase() vid appstart: senaste updated_at vinner, åt båda håll.
//  - Allt är robust mot offline: nätfel sväljs, cachen är källan tills nätet är uppe.
import { supabase } from './supabaseClient'

let currentUserId = null

const TABLE = 'focushealth_kv'
const nsKey = (key) => `focushealth:${currentUserId}:${key}`
const metaKey = () => `focushealth:${currentUserId}:__meta`

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(metaKey()) || '{}')
  } catch {
    return {}
  }
}

function writeMeta(meta) {
  try {
    localStorage.setItem(metaKey(), JSON.stringify(meta))
  } catch {
    /* ignore quota errors */
  }
}

function setLocal(key, value, updatedAt) {
  try {
    localStorage.setItem(nsKey(key), value)
    const meta = readMeta()
    meta[key] = updatedAt || new Date().toISOString()
    writeMeta(meta)
  } catch {
    /* ignore */
  }
}

function getLocal(key) {
  try {
    return localStorage.getItem(nsKey(key))
  } catch {
    return null
  }
}

// Värdena från komponenten är JSON-strängar. Vi lagrar dem som riktig jsonb när
// det går (queryable och rent), och packar upp till sträng igen vid läsning.
function toJsonb(value) {
  try {
    return JSON.parse(value)
  } catch {
    return value // skalär sträng är giltig jsonb
  }
}

function fromJsonb(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function pushToSupabase(key, value, updatedAt) {
  if (!currentUserId) return
  try {
    await supabase.from(TABLE).upsert(
      {
        user_id: currentUserId,
        key,
        value: toJsonb(value),
        updated_at: updatedAt,
      },
      { onConflict: 'user_id,key' }
    )
  } catch {
    /* offline — cachen behåller ändringen, synkas vid nästa start/online */
  }
}

export function setStorageUser(userId) {
  currentUserId = userId
}

// Hämta alla rader vid start och sammanfoga med cachen (senaste updated_at vinner).
// Pushar även lokala ändringar som är nyare än servern (offline-skrivningar).
export async function syncFromSupabase() {
  if (!currentUserId) return
  let rows = []
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('key, value, updated_at')
      .eq('user_id', currentUserId)
    if (error) throw error
    rows = data || []
  } catch {
    return // offline: jobba vidare mot cachen
  }

  const meta = readMeta()
  const remoteKeys = new Set()
  let changed = false

  for (const row of rows) {
    remoteKeys.add(row.key)
    const localUpdated = meta[row.key]
    const remoteUpdated = row.updated_at
    if (!localUpdated || new Date(remoteUpdated) > new Date(localUpdated)) {
      setLocal(row.key, fromJsonb(row.value), remoteUpdated)
      changed = true
    } else if (new Date(localUpdated) > new Date(remoteUpdated)) {
      // Lokalt nyare (skrevs offline) → pusha upp.
      const localVal = getLocal(row.key)
      if (localVal != null) pushToSupabase(row.key, localVal, localUpdated)
    }
  }

  // Lokala nycklar som inte finns på servern alls → pusha upp.
  for (const key of Object.keys(meta)) {
    if (!remoteKeys.has(key)) {
      const localVal = getLocal(key)
      if (localVal != null) pushToSupabase(key, localVal, meta[key])
    }
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent('focushealth:synced'))
  }
}

const storage = {
  async get(key) {
    const cached = getLocal(key)
    // Bakgrundsuppdatering — blockerar aldrig UI:t.
    if (currentUserId) {
      supabase
        .from(TABLE)
        .select('value, updated_at')
        .eq('user_id', currentUserId)
        .eq('key', key)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          const meta = readMeta()
          const localUpdated = meta[key]
          if (!localUpdated || new Date(data.updated_at) > new Date(localUpdated)) {
            setLocal(key, fromJsonb(data.value), data.updated_at)
            window.dispatchEvent(new CustomEvent('focushealth:synced'))
          }
        })
        .catch(() => {})
    }
    return cached
  },

  async set(key, value) {
    const updatedAt = new Date().toISOString()
    setLocal(key, value, updatedAt) // omedelbart
    pushToSupabase(key, value, updatedAt) // i bakgrunden
    return value
  },

  async delete(key) {
    try {
      localStorage.removeItem(nsKey(key))
      const meta = readMeta()
      delete meta[key]
      writeMeta(meta)
    } catch {
      /* ignore */
    }
    if (currentUserId) {
      try {
        await supabase.from(TABLE).delete().eq('user_id', currentUserId).eq('key', key)
      } catch {
        /* offline */
      }
    }
  },

  async list(prefix = '') {
    const meta = readMeta()
    return Object.keys(meta).filter((k) => k.startsWith(prefix))
  },
}

// Exponera globalt så att komponentkoden kan använda window.storage oförändrad.
if (typeof window !== 'undefined') {
  window.storage = storage
}

export default storage
