# Impact and deployment

> Status: HopeGrid has **not** been used by real people in a real emergency. No partner has agreed to anything.
> Organisations named below are **candidate** partners to approach, not partners. Placeholders marked
> **[TO FILL]** are for evidence the team collects.

## 1. What "works offline" really means

| Part | Works without internet? | Detail |
|---|---|---|
| Victim's phone, report form | **Yes** | The app shell is cached (PWA). The report, photo and voice note are saved on the phone (IndexedDB outbox), and a code + PIN is shown straight away. |
| Victim's report reaching coordinators | **No** | Nothing reaches the coordinator until the phone reaches the server. The outbox retries on its own (app start, when the connection returns, every 15 s). |
| Server laptop | **Needs internet** | The database, photos and staff logins live in Supabase (cloud). The AI and speech models run locally, but the pipeline can't save results while the database is unreachable. It retries: failed reports are retried after 5 s, 30 s and 2 min, then by a sweep every 10 minutes. That FAILED reports are picked up again and finished without a second incident is tested; the timings are not. |
| Coordinator and volunteer screens | **No** | They show the last data they had and an offline banner. |
| Public map | Partly | Map images need internet; the page falls back to a list. |

So HopeGrid **delays** reports during an outage but doesn't **lose** them; it can't deliver them during the outage.
The whole chain works only when the phone, the server laptop and Supabase can reach each other.

## 2. Deployment models

| Model | Who runs the server laptop | Suits | Main risk |
|---|---|---|---|
| **Ward / zonal office** | A municipal or revenue official trained as coordinator, with local volunteer groups | Cities with ward-level disaster cells | Staff time during a crisis; official approval needed |
| **Community centre / relief camp** | Resident welfare association or camp in-charge | Neighbourhoods that already organise volunteers | Laptop, power and internet at the centre during floods |
| **NGO control room** | An NGO already doing flood or cyclone relief | NGOs with trained volunteers and field teams | Keeping the laptop, internet and updates running across seasons |

Minimum setup per site (from the Run Guide): one laptop with Node.js 22 and the models installed
(`npm run setup-ai`, ~2.5 GB), a Supabase project, a power backup, two independent internet links (e.g. broadband
plus a phone hotspot), and the public HTTPS link (`npm run tunnel`) printed as a QR code for residents.

## 3. Who operates what, and training needed

| Role | Tasks | Training (estimate, not measured) |
|---|---|---|
| Server operator | Start and stop the server, keep power and internet up, run backups, install updates | Half a day with the Run Guide |
| Coordinator | Verify, merge, assign, resolve; watch the escalation hints; use the resources page | 1–2 hours of practice with the demo data |
| Volunteer | Accept, update status, chat | 15 minutes on the phone |
| Residents | Scan the QR code, add the app to the home screen, send a test report | A one-page leaflet in Tamil/Hindi/English **[TO FILL: draft leaflet]** |

## 4. Adoption barriers

- **Trust and official status:** people call 112 or known officials, not a new link. HopeGrid needs to be
  introduced by a trusted local body, and it shows 112 on every victim screen.
- **Smartphones only:** there's no SMS channel, so feature-phone users are left out (see docs/comparison.md §4).
- **Literacy and language:** voice notes help, but the screens are in 3 languages only, and Tamil AI accuracy is
  weak (docs/evaluation.md).
- **Continuity:** the tool has to be ready before the monsoon, not built during it. Data must be cleaned after each
  season (`server/scripts/cleanup.ts`).
- **Liability and privacy:** who is responsible for a missed report, and how long phone numbers and voice notes
  are kept. This needs a written policy with the operating body (see §6).

## 5. Risks

| Risk | Effect | Mitigation today | Still open |
|---|---|---|---|
| **Single laptop** (power, theft, crash, water) | Nothing is processed; coordinators see nothing new | Reports wait safely on phones (outbox) and in the database (PENDING/FAILED, retried) | A second laptop ready to take over; no automatic failover |
| **Internet outage at the server** | Reports can't be stored or read | Outbox retries; the pipeline retries | Two internet links; SMS fallback not built |
| **AI misreads a report** | Wrong type or priority | Victim-selected needs and people override the AI; every score shows its reasons; humans verify | AI accuracy is modest (docs/evaluation.md) |
| **Fake or malicious reports** | Wasted effort | Only verified incidents reach the public map (BR-80); coordinators reject; confidence reflects independent phones and photos | No rate limiting (owner decision); the 4-digit PIN can be guessed by repeated requests |
| **Leaked keys** | Full database access | Keys only in the server's `.env` | The keys committed earlier must be rotated (TODO.md) |
| **Demo tools left on** | Demo reset wipes data | Reset only works from the server laptop itself (tested) | Set `DEV_MODE=false` for real use |

## 6. How to validate with real users (plan)

1. **Pick one site** (a ward office, relief camp or NGO) and one contact person **[TO FILL]**.
2. **Tabletop exercise (2 hours):** 5–10 residents send prepared reports by voice and text in their own language,
   one coordinator triages, and two volunteers respond. Measure:
   - time from "Send" to appearing on the dashboard
   - correct type and priority as judged by the coordinator
   - duplicates caught
   - how many testers finished without help
3. **Language check:** native speakers review the Tamil/Hindi screens and a sample of transcripts.
4. **Offline drill:** testers send reports in airplane mode, then reconnect. Count reports delivered versus sent.
5. **Debrief** with the feedback template below; fix the top three problems; repeat once.
6. **Ethics:** no real emergency data. Use volunteers who consent, use prepared scripts, and delete the data after
   the exercise (`server/scripts/cleanup.ts`).

### Candidate partners to approach (none contacted yet)
- A District Disaster Management Authority (DDMA) or city corporation disaster cell **[TO FILL]**
- A local NGO that already runs flood relief **[TO FILL]**
- A college NSS/NCC unit for volunteer testers **[TO FILL]**

## 7. Feedback template

```
Tester role:          victim / coordinator / volunteer / resident
Language used:        Tamil / Hindi / English / mixed
Phone model:          ______   Network during test: 4G / 3G / Wi-Fi / none
1. Could you send a report without help?                          yes / with help / no
2. How long did it take (seconds)?                                ______
3. Was anything confusing? What?                                   ______
4. Did the coordinator's screen show the right type and urgency?  yes / partly / no
5. Would you use this in a real flood? Why / why not?             ______
6. One thing to change first:                                     ______
```

## 8. Evidence collected so far

| Evidence | Status |
|---|---|
| Automated tests (API + business rules) | Done — docs/verification.md |
| AI accuracy on synthetic reports | Done — docs/evaluation.md |
| Tabletop exercise with real users | **[TO FILL]** |
| Native-speaker language review | **[TO FILL]** |
| Letter or feedback from a candidate partner | **[TO FILL]** |
| Demo video | **[TO FILL]** |
