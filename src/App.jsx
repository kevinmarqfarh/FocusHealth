import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { setStorageUser, syncFromSupabase } from './storage'
import Auth from './Auth'
import FocusHealth from './FocusHealth'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // När vi har en användare: scope:a storage och synka mot Supabase.
  useEffect(() => {
    if (session?.user) {
      setStorageUser(session.user.id)
      syncFromSupabase()
    } else {
      setStorageUser(null)
    }
  }, [session?.user?.id])

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-mark">FOCUSHEALTH</div>
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  return <FocusHealth session={session} />
}
