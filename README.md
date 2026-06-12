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
- **`src/App.jsx`** — auth-gate (e-post + lösenord).
- **`src/Auth.jsx`** — inloggning/skapa konto med lösenord.
- **`src/FocusHealth.jsx`** — UI:t (lagren Idag + Översikt).
- **`supabase/migrations/0001_init.sql`** — `focushealth_kv`-tabell + RLS.

## Inloggning (e-post + lösenord)

Privat projekt → lösenordsbaserad inloggning, ingen magic-link. Skapa kontot en
gång via **Skapa konto**; sessionen sparas sedan på enheten.

**Rekommenderat (slipp bekräftelsemejl):** stäng av e-postbekräftelse så att
kontoskapande loggar in direkt:

**Supabase → AppDB → Authentication → Sign In / Providers → Email** → slå av
**"Confirm email"** → Spara.

Om du hellre behåller bekräftelse på: sätt **Site URL** till
`https://focushealth.vercel.app` under Authentication → URL Configuration, så
landar bekräftelselänken rätt. Bekräfta en gång, sedan räcker lösenordet.

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
