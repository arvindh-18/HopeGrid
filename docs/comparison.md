# How HopeGrid compares with existing tools

> Method: for each tool, only what its **own public documentation or repository** states was recorded, checked on
> 2026-09-29 (links below). "Not verified" means we did not find it stated, **not** that the tool lacks it. This is
> a desk comparison; none of these tools was installed or tested by the team.

## 1. Tools compared

| Tool | What it is (from its own pages) | Sources |
|---|---|---|
| **Ushahidi** | "an open source web application for information collection, visualization and interactive mapping" collecting from "SMS, Twitter, RSS feeds, Email" (and web). Mobile apps: "support for offline data collection … with or without an Internet connection" (2017). Licence AGPL-3.0; self-host with Docker. | [GitHub README](https://github.com/ushahidi/platform), [overview](https://www.ushahidi.com/support/overview/), [2017 app post](https://www.ushahidi.com/about/blog/ushahidis-new-ios-and-android-apps-help-people-capture-reports-anywhere) |
| **KoboToolbox** | "an innovative open source platform for collecting, managing, and visualizing data"; forms downloaded to the KoboCollect Android app "for offline data collection"; "form translations in hundreds of different languages"; "automated features to transcribe and translate audio responses" and "AI-assisted qualitative analysis". | [Introduction](https://support.kobotoolbox.org/welcome.html), [KoboCollect](https://support.kobotoolbox.org/data_collection_kobocollect.html) |
| **Sahana Eden** | Open-source "humanitarian platform … for critical humanitarian needs management"; messaging "by Email, SMS, Twitter and Google Talk". The Sahana Foundation site now lists it under "Eden Legacy Archive". | [Sahana Foundation](https://sahanafoundation.org/products/eden/) |
| **Kerala Rescue (2018)** | Volunteer-built "Website for co-ordinating the rehabilitation of the people affected in the Kerala Floods"; rescue requests verified by volunteers through an Ushahidi portal. Django + PostgreSQL, MIT licence. | [GitHub README](https://github.com/IEEEKeralaSection/rescuekerala) |
| **ArcGIS Survey123** (commercial, Esri) | "Surveys continue to work in … the Survey123 field app while disconnected"; "An ArcGIS organization in either ArcGIS Online or ArcGIS Enterprise is required to create surveys". | [Esri FAQ](https://doc.arcgis.com/en/survey123/get-started/faqgeneral.htm) |
| **ERSS 112 / 112 India app** (Government of India) | "can handle multiple types of emergency signals like Voice calls, SMS, Panic signals, emails and Web requests through a common platform"; the 112 India app sends SOS alerts to emergency contacts. | [C-DAC](https://www.cdac.in/index.aspx?id=blog_ni_erss) |

## 2. Comparison table

| | Offline reporting | AI runs locally (no cloud AI service) | Multilingual **voice** reports | Public view private by design | Humans decide (AI never acts) | Cost / self-hosting |
|---|---|---|---|---|---|---|
| **HopeGrid** | Yes — phone saves the report and sends it later (outbox), or sends it by SMS with signal but no data (F27, through one gateway phone). | Yes — Qwen 2.5 3B + Whisper run on the **server laptop** (not on the phone) | Yes — Whisper transcription + English translation; quality measured and **weak for Tamil** (docs/evaluation.md) | Yes — only verified incidents, coordinates rounded, no report text (BR-80/81, tested) | Yes — AI only fills fields (AR-20, tested) | Self-hosted on one laptop + a Supabase project. **No licence file yet** (TODO) |
| **Ushahidi** | Yes (mobile apps) | Not verified | Not verified | Not verified | Not verified | Open source (AGPL-3.0), self-hostable; hosted plans not verified |
| **KoboToolbox** | Yes (KoboCollect, web forms) | Not verified (AI features exist; where they run is not stated) | Audio transcription and translation stated; languages covered not verified | Not verified (a data-collection tool, not a public map) | Not verified | Open source; self-hosting not verified |
| **Sahana Eden** | Not verified | Not verified | Not verified | Not verified | Not verified | Open source; listed as legacy |
| **Kerala Rescue** | Not verified | Not verified | Not verified | Not verified | Yes — volunteers verified requests | Open source (MIT) |
| **ArcGIS Survey123** | Yes (field app) | Not verified | Not verified | Not verified | Not verified | Commercial (an ArcGIS Online or ArcGIS Enterprise organisation is required); self-hosting not verified |
| **ERSS 112** | Not verified (SMS and voice are listed channels) | Not verified | Not verified | Not applicable | Not verified | Government service |

## 3. Where HopeGrid is different

1. **The whole loop in one small system.** HopeGrid covers the victim report, AI structuring, triage scores with
   reasons, duplicate flags, volunteer matching, private chat and a public safety map. Each tool above covers part of
   this, e.g. data collection (KoboToolbox, Survey123) or crowd mapping (Ushahidi).
2. **Local AI, no per-request cost or outside AI service.** Transcription and structuring run on the server laptop
   (docs/architecture.md D10–D11). Reports aren't sent to a third-party AI API.
3. **Built for Indian languages from the start.** Speech in Whisper's 14 Indian-language list is transcribed and
   translated to English for the AI. Victim screens are in Tamil and Hindi. Keyword fallback covers English, Tamil and
   Hindi.
4. **Privacy and safety rules are enforced by tests.** The public map shows only coordinator-verified incidents with
   rounded coordinates; chat never shows phone numbers. Both are asserted in `tests/integration/api.test.ts`.

## 4. Where the alternatives are stronger (honest)

- **Maturity and real deployments.** Ushahidi, KoboToolbox and Survey123 are established products. HopeGrid is a
  hackathon prototype with no real users yet.
- **SMS and feature phones.** Ushahidi, Sahana Eden and ERSS 112 accept SMS. HopeGrid now accepts SMS too (F27),
  but only through one Android gateway phone with one SIM, and feature-phone users get reporting only (no tracking,
  chat or map). It has not been tried with a real gateway phone yet.
- **Language breadth.** KoboToolbox supports form translations in hundreds of languages. HopeGrid's screens are in
  3 languages, and its own evaluation shows weak AI accuracy on Tamil.
- **Official status and reach.** 112 is the national emergency number with state dispatch; HopeGrid is not
  connected to it (escalation is simulated).
- **Offline maps and forms.** Survey123 and KoboToolbox have configurable offline forms. HopeGrid's map needs
  internet and falls back to a list.
- **Scale.** HopeGrid runs on one laptop with a single processing queue (docs/scaling.md).

## 5. Open questions (TODO: needs verification)

- Does Ushahidi or KoboToolbox offer automatic triage or prioritisation of reports?
- Where do KoboToolbox's transcription and translation run (cloud or self-hosted), and which Indian languages do
  they support?
- What do Indian district and state authorities currently use for citizen reports during floods, other than 112?
