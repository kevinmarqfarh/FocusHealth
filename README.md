# FocusHealth

Personlig hälsodashboard för energi och mental klarhet. Installerbar PWA byggd
med Vite + React, Supabase (auth + persistens) och `vite-plugin-pwa`.

**Live:** https://focushealth.vercel.app

## Köra lokalt

```bash
npm install
cp .env.example .env   # fyll i värdena (se nedan)
npm run dev            # http://localhost:5173
```

`.env` (redan ifylld lokalt, committas aldrig):

```
VITE_SUPABASE_URL=https://bqudyrnjvbhwtevxorwp.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Anon-nyckeln + Row Level Security är säker att skicka till klienten.

## Arkitektur

- **`src/storage.js`** — adapter som exponerar `window.storage`
  (`get/set/delete/list`), oförändrat API. Write-through till localStorage för
  omedelbar UI och offline, upsert till Supabase i bakgrunden. Vid appstart
  synkas rader (senaste `updated_at` vinner) → samma data på iPhone och iPad.
- **`src/supabaseClient.js`** — Supabase-klient med persistent session.
- **`src/App.jsx`** — magic-link auth-gate.
- **`src/FocusHealth.jsx`** — UI:t (lagren Idag + Översikt).
- **`supabase/migrations/0001_init.sql`** — `focushealth_kv`-tabell + RLS.

## ⚠️ Ett manuellt steg krävs (Supabase auth-redirect)

För att magic-link-mejlen ska landa rätt måste appens URL:er finnas i Supabase
redirect-allowlistan. Detta går inte att sätta via CLI utan en access token, så
gör det en gång i dashboarden:

**Supabase → Authentication → URL Configuration**

- **Site URL:** `https://focushealth.vercel.app`
- **Redirect URLs** (lägg till alla tre):
  - `https://focushealth.vercel.app`
  - `https://focushealth-*.vercel.app` (preview-deployer)
  - `http://localhost:5173` (lokal utveckling)

Spara. Därefter fungerar inloggning på både prod och lokalt.

> Free-tier skickar mejl via Supabases delade avsändare (några/timme) och kan
> hamna i skräpposten första gången. För skarpare leverans: koppla egen SMTP
> under Authentication → Emails.

## Lägg till på hemskärmen (iPhone / iPad)

1. Öppna **https://focushealth.vercel.app** i **Safari**.
2. Tryck på **Dela**-ikonen (fyrkant med pil uppåt).
3. Välj **Lägg till på hemskärmen** → **Lägg till**.
4. Öppna appen från hemskärmsikonen — den startar i fullskärm utan
   webbläsar-UI, respekterar safe-areas (Dynamic Island/home-indikator) och
   fungerar vid kortvarig offline.

Logga in en gång per enhet (iPhone + iPad). Sessionen sparas, och din data
synkas mellan enheterna.

## Deploy

Pushas via Vercel (`vercel --prod`). Miljövariablerna `VITE_SUPABASE_URL` och
`VITE_SUPABASE_ANON_KEY` är satta i Vercel-projektet för Production/Preview/Development.
