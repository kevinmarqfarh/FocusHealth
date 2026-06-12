// Allt textinnehåll för "Fördjupning" och dagliga fokusrader.
// Evidensraden (italic, guld) lär ut VARFÖR.

export const SUPPLEMENTS = [
  { id: 'creatine', label: 'Kreatin', dose: '5 g' },
  { id: 'omega3', label: 'Omega-3', dose: '2 kaps med mat' },
  { id: 'd3', label: 'D3', dose: '2500 IE' },
  { id: 'magnesium', label: 'Magnesium', dose: '2 kaps kväll' },
]

export const WORKOUTS = [
  { id: 'zon2', label: 'Zon 2' },
  { id: 'intervaller', label: 'Intervaller' },
  { id: 'styrka', label: 'Styrka' },
  { id: 'lopning', label: 'Löpning' },
  { id: 'sport', label: 'Sport' },
  { id: 'vila', label: 'Vila' },
]

// Roterande evidensbaserade mikroinstruktioner (en per dag).
export const DAILY_FOCUS = [
  'Drick ett stort glas vatten innan första kaffet.',
  'Gå ut i dagsljus inom 30 minuter efter att du vaknat.',
  'Ät protein och grönt före kolhydraterna på lunchen.',
  'Ta en 10-minuterspromenad efter lunch — flackare blodsocker.',
  'Lägg telefonen utanför sovrummet ikväll.',
  'Andas i fyrkant 4-4-4-4 i två minuter före ett tufft möte.',
  'Sikta på samma läggtid som igår — rytmen slår längden.',
  'Stå upp och rör dig två minuter varje timme idag.',
  'Sista kaffet senast tio timmar före läggdags.',
  'Tugga långsammare på lunchen — mättnaden hinner ikapp.',
  'Två minuters kall avslutning i duschen för skärpa.',
  'Skriv ned dagens tre viktigaste innan du öppnar mejlen.',
  'Dämpa ljuset hemma två timmar innan du ska sova.',
  'Lägg ett styrkepass nära ett måltidstillfälle idag.',
]

// Kunskapsbiblioteket — varje sektion har block med korta rader + evidensrad.
export const LIBRARY = [
  {
    id: 'traning',
    title: 'Träning',
    blocks: [
      {
        heading: 'Träningsveckan',
        lines: [
          'Barnfri vecka: 4 pass. Barnvecka: 2 pass (kvalitet före kvantitet).',
          'Mån — Zon 2, 45–60 min lugnt (kan prata, puls 60–70 % av max).',
          'Tis — Styrka helkropp: 3 baslyft, 3×5–8 reps.',
          'Tors — Intervaller: 4×4 min hårt / 3 min lätt mellan.',
          'Lör — Längre Zon 2 eller sport.',
          'Övriga dagar vila; promenad och vardagsrörelse räknas alltid.',
        ],
        evidence:
          'Zon 2 bygger den aeroba basen och mitokondrierna; 4×4-intervaller höjer VO₂max mest per minut (Helgerud 2007).',
      },
      {
        heading: 'Styrkans baslyft',
        lines: [
          'Knäböj, marklyft, bänk/press, rodd — rotera så alla mönster täcks.',
          'Lägg 1–2 reps i reserv. Progressiv ökning vecka för vecka.',
        ],
        evidence:
          'Att träna nära men inte till failure ger nästan samma hypertrofi med mindre trötthet (Grgic 2022).',
      },
    ],
  },
  {
    id: 'kost',
    title: 'Kost & Näring',
    blocks: [
      {
        heading: 'Dygnsschema',
        lines: [
          '07:00 Frukost — protein + långsamma kolhydrater + omega-3.',
          '12:30 Lunch — enligt lunchprotokollet nedan.',
          '15:00 Mellanmål — frukt + nötter eller proteinyoghurt.',
          '19:00 Middag — protein + grönt + nyttiga fetter, lättare kolhydrater.',
          '21:30 Magnesium, nedtrappning, skärmar av.',
        ],
        evidence:
          'Regelbundna måltidstider stabiliserar dygnsrytm och aptitreglering (Manoogian 2022).',
      },
      {
        heading: 'Lunchprotokollet',
        lines: [
          'Ät i ordning: protein → grönsaker → kolhydrater sist.',
          '10 minuters promenad direkt efter lunch.',
          'Mål: ingen eftermiddagsdipp kl 14–15.',
        ],
        evidence:
          'Protein och grönt före kolhydrater sänker blodsockertoppen ~30 % och dämpar eftermiddagströttheten (Shukla 2015).',
      },
      {
        heading: 'Måltidsförslag',
        lines: [
          'Frukost: äggröra + havregröt + bär, eller skyr + nötter + blåbär.',
          'Lunch: lax/kyckling + quinoa/potatis + stor sallad + olivolja.',
          'Middag: nötfärs/fisk + grönsaker + linser.',
        ],
        evidence:
          'Protein 1,6–2,2 g/kg/dag maximerar muskelproteinsyntes och mättnad (Morton 2018).',
      },
      {
        heading: 'Inköpslista (ca-priser)',
        lines: [
          'Lax 400 g — 89 kr',
          'Kycklingfilé 1 kg — 99 kr',
          'Ägg 18-pack — 49 kr',
          'Havregryn 1,5 kg — 25 kr',
          'Blåbär frysta 1 kg — 39 kr',
          'Skyr 1 kg — 32 kr',
          'Quinoa 500 g — 35 kr',
          'Olivolja 500 ml — 69 kr',
          'Spenat/sallad — 25 kr',
          'Blandade nötter 500 g — 59 kr',
        ],
        evidence:
          'Baslivsmedel i botten håller både budget och näringskvalitet stabila vecka efter vecka.',
      },
    ],
  },
  {
    id: 'somn',
    title: 'Sömn',
    blocks: [
      {
        heading: 'Sömnfönstret',
        lines: [
          'Mål 7–9 timmar. Fast läggtid — samma tid även i helgen.',
          'Dagsljus inom 30 min efter uppvaknande.',
          'Dämpa ljuset 2 timmar innan sömn; koffeinstopp 10 timmar innan.',
          'Svalt och mörkt sovrum, ca 18 °C.',
        ],
        evidence:
          'Morgonljus tidigarelägger dygnsrytmen och förbättrar insomningen samma kväll (Czeisler).',
      },
    ],
  },
  {
    id: 'tillskott',
    title: 'Tillskott',
    blocks: [
      {
        heading: 'Dagligt stack',
        lines: [
          'Kreatin 5 g — kognitivt och muskulärt, ta när som helst, varje dag.',
          'Omega-3 2 kaps med mat — EPA/DHA, hjärna och hjärta.',
          'D3 2500 IE — särskilt oktober–mars i Sverige.',
          'Magnesium 2 kaps kväll — sömn och muskelavslappning.',
        ],
        evidence:
          'Kreatin 3–5 g/dag förbättrar både styrka och arbetsminne, särskilt vid sömnbrist (Avgerinos 2018).',
      },
    ],
  },
  {
    id: 'mal',
    title: 'Mål & Checkpoints',
    blocks: [
      {
        heading: '12-veckorsplanen',
        lines: [
          'V1–4 Etablera rutin: logga dagligen, träffa passmål, håll sömnfönstret.',
          'V4 checkpoint: vilopuls ↓ 2–4 slag, energi-snitt upp.',
          'V5–8 Öka intensitet: +1 intervallpass, höj styrkevolymen.',
          'V8 checkpoint: klarhet-snitt ≥ 7, streak ≥ 14 dagar.',
          'V9–12 Konsolidera: finslipa kost, förläng Zon 2.',
          'V12 checkpoint: vilopuls ↓ 5+, energi & klarhet stabilt höga.',
        ],
        evidence:
          'Det tar ~8 veckor regelbunden kondition för mätbar sänkning av vilopuls och bättre HRV (Buchheit 2013).',
      },
    ],
  },
]
