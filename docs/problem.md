# The problem HopeGrid addresses

> **Hackathon track:** TODO — to be filled in by the team.
>
> Every statistic here links to the page it came from, and was checked against that page on 2026-09-29. Anything
> not yet checked is marked **TODO: needs verification**. The scenario in §5 is illustrative, not real data.

## 1. Problem statement

When a flood, cyclone or fire hits an Indian neighbourhood, the people who need help, the neighbours who could help,
and the coordinators deciding where to send them are usually not looking at the same information. Requests for
help arrive by phone, messaging groups and word of mouth, in several languages, often while phone networks are
partly down. Coordinators then have to work out what is happening, where, how urgent it is, and whether two
messages describe the same emergency.

HopeGrid is a small, self-hosted system for that local picture. People report by typing or speaking in their own
language, even offline. A local AI turns each report into structured facts. Coordinators see one ranked list with
the reasons behind each ranking. Volunteers get matched assignments. The community sees a public map of verified
hazards only.

## 2. Why this matters in India (sourced)

| Fact | Source |
|---|---|
| "58.6 per cent of the landmass is prone to earthquakes of moderate to very high intensity; over 40 million hectares (12 per cent of land) is prone to floods and river erosion; of the 7,516 km long coastline, close to 5,700 km is prone to cyclones and tsunamis; 68 per cent of the cultivable area is vulnerable to drought and hilly areas are at risk from landslides and avalanches." | National Policy on Disaster Management, Ministry of Home Affairs, Government of India — [mha.gov.in PDF](https://mha.gov.in/sites/default/files/2022-09/NPDM-101209_2[1].pdf) |
| Phone networks fail when they're needed most: during Cyclone Michaung (Dec 2023), Tamil Nadu's Chief Secretary said "there were 42,747 cell phone towers in the city of which 70 per cent were currently operational", the rest not working "due to lack of power". | PTI report in The Week, 5 Dec 2023 — [theweek.in](https://www.theweek.in/wire-updates/national/2023/12/05/mds20-tn-cyclone-chief-secretary.html) |
| India's Census language data lists 22 scheduled languages and 121+ languages in total. | Census of India, Language Division — [language.census.gov.in](https://language.census.gov.in/) |
| India's national emergency number 112 (ERSS) "can handle multiple types of emergency signals like Voice calls, SMS, Panic signals, emails and Web requests through a common platform", and the 112 India app sends SOS alerts. | C-DAC (the Ministry of Home Affairs' solution provider for ERSS) — [cdac.in](https://www.cdac.in/index.aspx?id=blog_ni_erss) |
| In the 2018 Kerala floods, volunteers built a website to coordinate the rehabilitation of affected people, and rescue requests were verified by volunteers through an Ushahidi portal. | Project README — [github.com/IEEEKeralaSection/rescuekerala](https://github.com/IEEEKeralaSection/rescuekerala) |

What these facts support: floods and cyclones affect large parts of India; mobile networks degrade in exactly
those events; people speak many languages; and communities have built ad-hoc coordination tools during recent
floods. Not claimed here, because nothing verified supports it yet: how often 112 or other lines are overwhelmed,
how long rescue requests wait, or how many requests are duplicates. **TODO: needs verification**, ideally from the
district or State Disaster Management Authority the team pilots with.

## 3. Who the users are and what they need

| User | Situation | What they need | Where current practice falls short (our reasoning, not measured) |
|---|---|---|---|
| **Victim** | In danger or cut off; stressed; may have weak or no signal; may not read English | Report in seconds, by voice or text, in their language, without an account; know the report arrived; a way to follow up | A voice call needs a live connection and a free line; typed messages in groups get lost in the stream; no receipt or status |
| **Community** | Nearby residents deciding where it's safe to go | Know which streets or areas are dangerous now, without rumours | Unverified forwards spread quickly; locations are vague |
| **Coordinator** (ward office, NGO, relief camp) | Many incoming requests at once; limited volunteers and supplies | One de-duplicated list ranked by urgency, with reasons; photos and voice notes; who is available nearby | Requests are scattered across phones and chats; duplicates are hard to spot; urgency judged by memory |
| **Volunteer** | Local responder with some skills and equipment | Clear assignments that fit their skills; a private way to reach the person; simple status updates | Assignments over calls and chats; victims' numbers shared widely |

## 4. How each HopeGrid feature maps to a need

| Need | Feature (docs/features.md) | How it helps |
|---|---|---|
| Report with weak or no signal | F01 report form, F02 offline outbox, F27 reports by SMS | The report is saved on the phone first and sends itself when a connection returns. With signal but no mobile data it can go at once as one SMS to the gateway phone; basic phones can text plain words |
| Report in one's own words and language | F03 voice note, F05 AI structuring (Whisper speech-to-text + English translation), F25 Tamil/Hindi screens | No need to type or pick from English menus. Whisper's language list includes 14 languages used in India (Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu, Assamese, Nepali, Sindhi, Sanskrit) but not Odia, Kashmiri, Konkani, Maithili, Manipuri, Santali or Dogri ([whisper/tokenizer.py](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py)). Being in the list doesn't guarantee good accuracy: see docs/evaluation.md |
| Know the report arrived; follow up | F04 tracking with code + PIN, F17 private chat | Status steps ("Help is on the way") and a chat that never shares the phone number |
| Triage many requests | F09 confidence and F10 priority with written reasons, F12 dashboard | Most urgent first; every score explains itself |
| Spot duplicates | F07 duplicate detection (flag only; a coordinator merges), F08 related incidents | One incident per real situation; nothing merged automatically |
| Send the right volunteer | F14 matching by skills, equipment and distance, F15 assignment workflow | Suggestions with "why" and "what's missing" |
| Safe public information | F19 public map (BR-80: only coordinator-verified incidents), F22 nearby banner | No private data, no unverified hazards |
| Humans stay in charge | AR-20: AI only fills fields | The AI never verifies, assigns, escalates or resolves |

## 5. Illustrative scenario (not real data)

*This is a made-up example to show the flow. It does not describe a real event.*

It is 2 a.m. during heavy rain. Water enters a ground-floor house near a canal. The family's phone has one bar of
signal, then none. The daughter opens HopeGrid, taps **Tap to speak** and says in Tamil that water is rising and her
grandmother cannot walk. She taps **Send**; the phone saves the report and shows a code and PIN. Twenty minutes
later the signal returns and the report sends itself.

On the server laptop at the ward office, Whisper transcribes the Tamil and adds an English translation. The local
AI marks it as a flood, with a vulnerable person who can't walk, in immediate danger, and priority CRITICAL. Two
neighbours report the same house; HopeGrid flags the second as a possible duplicate, and the coordinator merges them
with one click. The coordinator verifies the incident, which puts it on the public map, and assigns the volunteer
with a boat and first-aid skills, 1.2 km away. The family's tracking page changes to "A volunteer has been
assigned", and the volunteer asks in the chat which floor they are on.

## 6. What HopeGrid is not

- Not a replacement for 112 or official warnings: the emergency number is shown on every victim screen.
- Not an official early-warning system.
- Not tested with real users yet: see `docs/impact-and-deployment.md` for the validation plan.
