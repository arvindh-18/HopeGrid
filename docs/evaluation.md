# AI evaluation — how well HopeGrid understands reports

> All numbers were measured on 2026-09-29 with the scripts in `eval/`. The reports are **synthetic and written by
> the project author** (not real emergencies). The Tamil and Hindi sentences have not been reviewed by native
> speakers. Samples are small (40 + 20 reports), so treat every percentage as a rough indication: one report is
> 2.5 points on the main set and 5 points on the held-out set.

## 1. Method

| | |
|---|---|
| What is scored | The `Extraction` fields the incident is built from: `type`, `people`, `trapped`, `medical`, `vulnerable`, `danger`, `mobilityIssue`, `needs` (exact set). Also "all fields" (every field right) and needs precision/recall over individual needs. |
| Main set | `eval/reports.jsonl`: 40 reports — 12 English, 10 Tamil, 10 Hindi, 8 mixed (Tanglish/Hinglish). Includes negations, number words, a prompt-injection attempt, and cause/effect hazards. |
| Held-out set | `eval/heldout.jsonl`: 20 new reports (5 per language group), written **before** any prompt change was run on them, to check whether an improvement generalises. |
| Labels | Hand-written by one author following the written guide in `eval/README.md`, which applies the AI's own field definitions (rules.md BR-11). There is no second labeller, so agreement between labellers is unknown. |
| Systems | (a) keyword extractor `shared/keywordExtractor.ts` (the fallback and the offline preview); (b) the production AI path `server/ai.ts` `structureText()` with Qwen 2.5 3B Instruct (GGUF Q4_K_M) through node-llama-cpp, temperature 0, JSON-schema grammar. |
| Commands | `npx tsx eval/run.ts` (main set), `npx tsx eval/run.ts --data heldout`, `npx tsx eval/prompt-experiment.ts`, `npx tsx eval/diagnose-type-bias.ts`, `npx tsx eval/bench.ts` |
| Machine | Apple M2, 8 GB RAM, macOS 26.5.2, Node 22.23.3; node-llama-cpp GPU backend: Metal |

## 2. Results — main set (40 reports)

### 2.1 Keyword extractor
| Group | n | type | people | trapped | medical | vulnerable | danger | needs | all fields |
|---|---|---|---|---|---|---|---|---|---|
| English | 12 | 75% | 92% | 92% | 92% | 92% | 58% | 75% | 42% |
| Tamil | 10 | 20% | 60% | 80% | 80% | 80% | 40% | 30% | 0% |
| Hindi | 10 | 90% | 90% | 90% | 80% | 90% | 70% | 70% | 50% |
| Mixed | 8 | 75% | 100% | 100% | 75% | 88% | 50% | 50% | 13% |
| **All** | 40 | **65%** | 85% | 90% | 83% | 88% | 55% | 58% | **28%** |

Needs (micro): precision 0.92, recall 0.50.

### 2.2 Local AI (production path, current prompt)
| Group | n | type | people | trapped | medical | vulnerable | danger | needs | all fields |
|---|---|---|---|---|---|---|---|---|---|
| English | 12 | 67% | 83% | 92% | 92% | 100% | 67% | 58% | 17% |
| Tamil | 10 | 30% | 90% | 70% | 80% | 80% | 70% | 30% | 10% |
| Hindi | 10 | 80% | 100% | 90% | 90% | 90% | 80% | 60% | 30% |
| Mixed | 8 | 50% | 100% | 88% | 88% | 88% | 75% | 50% | 13% |
| **All** | 40 | **58%** | 93% | 85% | 88% | 90% | 73% | 50% | **18%** |

Needs (micro): precision 0.72, recall 0.54. 1 of 40 reports fell back to keywords: a call that ran past its 30 s
limit while the laptop was swapping (§4).

### 2.3 Held-out set (20 reports, written before any prompt change)
| System | type | people | trapped | medical | vulnerable | danger | needs | all fields |
|---|---|---|---|---|---|---|---|---|
| Keyword extractor | 60% | 80% | 85% | 85% | 80% | 65% | 65% | 20% |
| Local AI (production path, `eval/run.ts --data heldout`) | 55% | 95% | 85% | 85% | 85% | 70% | 45% | 25% |

AI: no fallbacks; median 5.1 s per report. The production-path numbers match the prompt experiment's copy of the
production prompt exactly (§3), which confirms that the experiment reproduced production faithfully.

### 2.4 Current production (after BR-11a was adopted, same day)
After the owner approved the type rule in §3 (keyword type when the rules find one, otherwise the AI's), both sets
were measured again through the production path (`npm run eval`, `npm run eval -- --data heldout`):

| Set | type | people | trapped | medical | vulnerable | danger | needs | all fields | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| Main (40) | **70%** | 93% | 85% | 88% | 90% | 75% | 48% | 23% | 0 |
| Held-out (20) | **70%** | 95% | 85% | 85% | 85% | 70% | 45% | 25% | 0 |

Type accuracy matches the offline prediction exactly (§3); the other fields are unchanged. (Danger 73% → 75% on the
main set only because report E02, which timed out in the first run, got a real AI answer this time.) Median time
per report in this run: 6.6 s (main) and 5.6 s (held-out), while other work was running on the laptop.

### 2.5 What this shows
- **On its own, the AI does not beat the keyword rules on incident type** (58% vs 65%). Its strengths are elsewhere:
  people count (93% vs 85%) and the danger flag (73% vs 55%). Combining the two for the type field (BR-11a) gives 70%
  on both sets (§2.4).
- **Tamil is weak for both** (type 20% keywords, 30% AI).
- **Neither system gets every field right for most reports** (28% and 18%). In HopeGrid, the coordinator reviews
  every incident, and the victim's own answers on the form (people, needs) override the AI.

## 3. A bias found, and what was tried

**Finding.** 10 of the AI's 17 type errors on the main set were `HEAVY_RAIN`, including for a fever, chest pain, a
fall, a gas leak and a power cut. Diagnosis on 4 of these reports (`eval/diagnose-type-bias.ts`):
- It isn't state leaking between reports: the first report in a fresh process also got `HEAVY_RAIN`.
- It isn't the JSON grammar either: without the grammar the model gave the same wrong answers (`HEAVY_RAIN` 3 times,
  `OTHER` once).
- Asking for `type` **after** the summary fixed 2 of the 4.

The three worked examples in the prompt are all weather cases (cyclone, fallen tree, rain flood), which may pull the
small model towards weather types.

**Experiment** (`eval/prompt-experiment.ts`, same model, main and held-out sets):

| Variant | Main set: type | Main: all fields | Held-out: type | Held-out: all fields | Held-out: trapped |
|---|---|---|---|---|---|
| V0 current prompt (production) | 58% | 18% | 55% | 25% | 85% |
| V1 `type` asked last | 78% | 13% | 60% | 15% | 75% |
| V2 +3 worked examples (medical, power, fire) and Hindi named in the prompt | 63% | 28% | 55% | 20% | 75% |
| V3 both | 70% | 20% | 70% | 20% | 75% |

**Decision rule, stated before looking at the held-out results:** adopt a change only if it improves the held-out
set on both type and all fields, without making the safety flags meaningfully worse.
**No variant passed:**
- V1 and V2 improved the main set but not the held-out set. This is overfitting to the reports the problem was
  found on.
- V3 improved held-out type but lowered all-fields and the trapped flag.

**The production prompt is unchanged.**

**A combination, adopted after approval (BR-11a).** Use the keyword type when the keyword rules find one, otherwise
the AI's type. This changes only `type`, so no other field can get worse:

| | Main: type | Main: all fields | Held-out: type | Held-out: all fields |
|---|---|---|---|---|
| Current AI alone | 58% | 18% | 55% | 25% |
| Keyword type if found, else AI | **70%** | 23% | **70%** | 25% |

It lifts type accuracy on both sets (+5 reports and +3 reports) but not "all fields" on the held-out set. Because it
changes how the live system picks incident types, it was put to the owner, approved on 2026-09-29, implemented as
`chooseType()` (rules.md BR-11a, with unit and API tests), and re-measured in production (§2.4).

## 4. Speed on this laptop (`eval/bench.ts`, 3 runs each)

Test audio is macOS text-to-speech (`say`) reading one report per language. It's synthetic and cleaner than real
phone recordings.

| Step | English | Hindi | Tamil |
|---|---|---|---|
| Audio length | 8.4 s | 8.2 s | 6.3 s |
| Speech-to-text (+ English translation for Hindi/Tamil), median | 1.2 s | 3.5 s | 6.7 s |
| AI structuring, median (first call 11.9 s) | 6.4 s | 5.4 s | 6.0 s |
| **Model time for one voice report (computed sum)** | **~7.6 s** | **~8.9 s** | **~12.7 s** |

Model loading: Whisper 0.75 s, LLM 4.6 s. In the prompt experiment the AI's median was 5.1–5.8 s per report.
Computed ceiling: at ~5.5 s per report and one report at a time, one laptop can structure about 650 text reports
an hour.

**Memory caveat (measured):** the laptop has 8 GB of RAM. Before the benchmark only 0.11 GB was free and 2.7 GB of
swap was in use. During the first full evaluation the machine swapped so heavily that one AI call took over 17
minutes, and the median rose to 9.4 s. The 30 s limit couldn't fire while the process was swapped out. A server
laptop with 16 GB is advisable.

## 5. Duplicate detection (BR-40) — `eval/duplicate-pairs.jsonl`

24 labelled pairs (12 duplicates, 12 separate situations). The pairs were written to probe the rule's edges, so
this measures known weaknesses, not typical performance.

| | Flagged | Not flagged |
|---|---|---|
| Really the same situation | TP 7 | FN 5 |
| Really different | FP 4 | TN 8 |

Precision 0.64, recall 0.58. What the misses and false alarms show:
- **Missed (FN):**
  - the same collapse reported 4 hours later (the rule's window is 3 h)
  - one flooded road with reporters 600 m apart (limit 500 m)
  - the same fire reported in Hindi and English, and the same landslide in Tamil and English: the words can't match
    across languages, and Devanagari isn't tokenised at all
  - the same place spelled "Lake View St" and "Lake View Street" with no GPS
- **False alarms (FP):** two different flooded houses 150 m apart; a heart attack next to a flood (MEDICAL is
  compatible with every type); two fallen trees on different roads with the same wording; two lift entrapments
  180 m apart.

Duplicate flags are only suggestions: a coordinator must confirm every merge (BR-43).

## 5b. Speech-to-text engines compared (`eval/asr.ts`, 2026-10-01)

The same 45 sentences (15 each in English, Tamil and Hindi: `eval/asr/sentences.jsonl`, disaster reports with a
place name and numbers) run through five engines. WER = word error rate and CER = character error rate, both after
normalising punctuation, case and Hindi nukta/chandrabindu spellings. Lower is better. Tamil WER is harsh because
Tamil joins words ("சிக்கியிருக்கிறோம்" vs "சிக்கி இருக்கிறோம்" counts as 2 errors), so **CER is the fairer
number for Tamil**.

**Run 1: synthetic voices** (macOS Rishi en-IN, Vani ta-IN, Lekha hi-IN; `npm run eval:asr -- synth`). This is a
smoke test, **not evidence**: TTS is clean, calm and perfectly pronounced. Apple M2, 8 GB; the HopeGrid server was
running at the same time.

| Language | Engine | WER | CER | s / clip | Wrong language |
|---|---|---|---|---|---|
| en | Whisper small, auto language (today) | 1.3% | 1.0% | 1.50 | 0 |
| en | Whisper small, language told | 1.3% | 1.0% | 0.80 | 0 |
| en | Whisper large-v3-turbo q5_0, language told | 1.7% | 1.5% | 3.77 | 0 |
| ta | Whisper small, auto language (today) | 32.5% | 7.0% | 1.84 | 0 |
| ta | Whisper small, language told | 32.5% | 7.0% | 1.23 | 0 |
| ta | Whisper large-v3-turbo q5_0, language told | 37.3% | 5.9% | 3.87 | 0 |
| ta | **IndicConformer Tamil** (AI4Bharat, int8, sherpa-onnx) | **11.8%** | **3.3%** | **0.25** | — |
| hi | Whisper small, auto language (today) | 40.1% | 19.8% | 2.68 | 0 |
| hi | Whisper small, language told | 40.1% | 19.8% | 1.92 | 0 |
| hi | Whisper large-v3-turbo q5_0, language told | 14.7% | 6.6% | 3.91 | 0 |
| hi | **IndicConformer Hindi** (int8, sherpa-onnx) | **2.4%** | **0.9%** | **0.15** | — |

What it suggests (to be confirmed with real voices):
- **Tamil and Hindi:** IndicConformer is the most accurate and 5–25× faster than Whisper. Whisper small mangles
  words that matter ("ambulance" → "कैम्मुल्लिंस").
- **English:** Whisper small is already good; turbo adds nothing here and is ~4× slower.
- **Telling Whisper the language** changed no word on these clips (auto-detection was always right on clean
  speech) but made it about 40% faster. Its value on noisy real speech is untested.
- **Place names** ("Velachery") are hard for every engine: a vocabulary hint is worth trying.

**Run 2: real voices** — the first 25 test recordings per language of Google's FLEURS dataset (volunteers reading
Wikipedia sentences, CC-BY-4.0; `npm run eval:asr -- fleurs`, then `compare eval/asr/clips-fleurs`). Real people and
microphones, but calm read speech about general topics, not disaster reports. Same laptop, 2026-10-01.

| Language | Engine | WER | CER | s / clip | Wrong language |
|---|---|---|---|---|---|
| en | Whisper small, auto language (today) | 11.8% | 8.6% | 1.68 | 0 |
| en | Whisper small, language told | 11.8% | 8.6% | 1.01 | 0 |
| en | Whisper large-v3-turbo q5_0, language told | 9.8% | 8.0% | 4.10 | 0 |
| ta | Whisper small, auto language (today) | 84.8% | 37.9% | 6.55 | 1 of 25 |
| ta | Whisper small, language told | 83.2% | 34.6% | 4.97 | 0 |
| ta | Whisper large-v3-turbo q5_0, language told | 75.0% | 27.8% | 6.09 | 0 |
| ta | **IndicConformer Tamil** | **39.7%** | **20.5%** | **1.04** | — |
| hi | Whisper small, auto language (today) | 62.7% | 36.3% | 4.22 | 3 of 25 |
| hi | Whisper small, language told | 57.0% | 28.0% | 3.52 | 0 |
| hi | Whisper large-v3-turbo q5_0, language told | 30.5% | 11.1% | 5.00 | 0 |
| hi | **IndicConformer Hindi** | **9.1%** | **5.0%** | **0.68** | — |

What real voices show:
- **Tamil:** today's Whisper small gets about 1 character in 3 wrong; IndicConformer roughly halves the error
  (38% → 21% CER) and is 6× faster. Its model card reports 16.7% CER on the first 100 FLEURS Tamil sentences, so our
  25-clip result is in line.
- **Hindi:** IndicConformer is far ahead (5% CER vs 36% today), 6× faster.
- **English:** Whisper small is fine (8.6% CER); turbo is only slightly better and 4× slower.
- **Telling Whisper the language matters on real speech:** auto-detection picked the wrong language for 3 of 25
  Hindi clips and 1 of 25 Tamil clips; telling it the language removed those errors and cut the error rate.
- Still untested: speech under stress, background noise, and mixed Tamil/Hindi with English words. Recording our
  own clips (`npm run eval:asr -- record ta|hi|en`) would cover that.

**Run 3: choosing the engines, and the server as built (BR-12)** — same 75 FLEURS clips, clean and with loud
background noise (`--noise 5`: pink noise at 5 dB SNR, like heavy rain or traffic; the speech is only ~1.8× louder
than the noise). FLEURS is parallel, so each Tamil and Hindi clip also has the English sentence it was translated
from, and the English version is scored with chrF (character n-gram F-score, 0–100, higher is better).
Apple M2, 8 GB, 2026-10-01, with the HopeGrid server running at the same time.

*Engines one by one* (`compare … --engines "language told,parakeet,indicconformer"`, with and without `--noise 5`):

| Language | Engine | CER clean | CER noise | WER clean | WER noise | s / clip (noise) |
|---|---|---|---|---|---|---|
| en | Whisper small, language told | 8.6% | 14.0% | 11.8% | 21.1% | 0.98 |
| en | Whisper large-v3-turbo q5_0, language told | 8.0% | 11.9% | **9.8%** | **14.9%** | 3.67 |
| en | **Parakeet TDT 0.6B v3** (q8_0) | **7.6%** | 11.5% | 10.0% | 15.2% | **0.33** |
| en | **Parakeet TDT 0.6B v3** (q4_k, the one the server uses) | 7.9% | **11.3%** | **9.7%** | 14.3% | **0.34** |
| ta | Whisper small, language told | 34.6% | 49.6% | 83.2% | 96.3% | 5.07 |
| ta | Whisper large-v3-turbo q5_0, language told | 27.8% | 45.4% | 75.0% | 94.7% | 6.44 |
| ta | **IndicConformer Tamil** | **20.5%** | **24.9%** | **39.7%** | **55.1%** | **1.08** |
| hi | Whisper small, language told | 28.0% | 46.3% | 57.0% | 75.3% | 4.81 |
| hi | Whisper large-v3-turbo q5_0, language told | 11.1% | 28.7% | 30.5% | 51.2% | 5.61 |
| hi | **IndicConformer Hindi** | **5.0%** | **10.6%** | **9.1%** | **19.5%** | **0.71** |

- **Tamil and Hindi:** IndicConformer is the most accurate and fastest, and holds up best in noise (Hindi: 10.6%
  vs 28.7–46.3% for Whisper).
- **English:** Parakeet and Whisper turbo are about level (Parakeet fewer character errors, turbo slightly fewer
  word errors); both beat Whisper small, most of all in noise. Parakeet is 3× faster than small and 11× faster than
  turbo, so it hears English. Its 4-bit file is as accurate as the 8-bit one and uses ~260 MB less memory (0.61 vs
  0.87 GB peak for a process with only that model), so the server uses the 4-bit file.

*Language detection* (one-off exploratory script, not kept; same 75 clean clips):
- Whisper small, full decode: 71/75 right, 4.5 s per clip. "Quick mode" (it still listens to the first 30 s but
  writes out only 1 s): 71/75, **2.2 s**. Whisper turbo: 69/75, 7.7 s.
- Every miss was a close neighbour: Hindi heard as Urdu, Tamil heard as Malayalam. Mapping Urdu → Hindi and
  Malayalam → Tamil makes all 75 right. So Whisper small in quick mode guesses the language.
- With noise, Whisper also guessed languages that make no sense here (Norwegian, Sinhala) for 3 Tamil clips. The
  app's language corrects those (row "app language = spoken" below).

*English version of Tamil and Hindi* (end-to-end rows below; plus a one-off check of the AI on the *reference*
transcript): Whisper's translate mode vs the local AI translating the transcript.
- Hindi: the AI is clearly better (50.4 vs 43.4 clean). Tamil: level (27.4 vs 27.2). From a *perfect* Tamil
  transcript the AI reaches only 29.1 (Hindi 53.7), so Tamil is limited by the 3B model's Tamil, not by speech
  recognition.
- Whisper large-v3-turbo can't translate (chrF ≈ 0: it repeats the Tamil or Hindi).
- The "multi-Indic" download is really AI4Bharat's Hindi model: 106.6% character errors on Tamil.

*The server as built* (`--engines "before BR-12,hopegrid"`): the real `server/transcribe.ts`, against Whisper small
exactly as the server ran before (language auto-detected, then Whisper's translate pass). The English rows were
re-run on the 25 English clips after the switch to the 4-bit Parakeet (same noise, since it is seeded by clip order).

| Language | Before: Whisper small | Now: routed | Now, noise | Before, noise | Now, noise, app language = spoken |
|---|---|---|---|---|---|
| en, CER / WER | 8.6% / 11.8% | **7.9% / 9.7%** | **11.3% / 14.3%** | 14.0% / 21.1% | 11.3% / 14.3% |
| ta, CER / WER | 37.9% / 84.8% | **20.5% / 39.7%** | **35.5% / 63.5%** | 62.6% / 98.0% | **24.9% / 55.1%** |
| hi, CER / WER | 36.3% / 62.7% | **5.0% / 9.1%** | **10.6% / 19.5%** | 62.8% / 84.9% | 10.6% / 19.5% |
| Wrong language (ta + hi) | 4 | **0** | **3** | 13 | **0** |
| English chrF, ta / hi | 27.2 / 43.4 | 27.4 / **50.4** | **26.4 / 46.0** | 20.4 / 34.6 | 26.7 / 46.0 |
| Seconds per clip, en / ta / hi | 1.8 / 9.5 / 6.1 | 2.0 / 8.3 / 8.3 | 2.0 / 13.6 / 10.0 | 1.7 / 13.8 / 7.2 | 2.0 / 11.2 / 10.5 |

What this shows:
- **Tamil:** about half the character errors of before, clean or noisy; with the app in Tamil (the usual case), noisy
  Tamil drops to 24.9% (from 62.6% before) because the app's language corrects Whisper's noisy guesses. **Hindi:**
  about a seventh of the errors clean and a sixth with noise. **English:** fewer errors, and the gap grows with
  noise.
- Noise hurts every engine, but Whisper small far more: noisy Tamil and Hindi were mostly unusable before (63%).
- The time per voice note is similar to before. Most of the Tamil/Hindi time is the AI's translation (~3 s).
- Still weak: the English version of Tamil. Still untested: Indian-accented English (FLEURS English is US speakers;
  Parakeet was as good as Whisper on synthetic en-IN voices, 0.6% vs 1.0% CER), stressed speech, real background
  sound rather than generated noise, and Tamil/Hindi mixed with English words.

## 6. Limitations

- Synthetic, author-written data; no real reports; no native-speaker review; one labeller.
- Small samples: differences under ~10 points are within noise.
- Speech was tested on real read recordings (FLEURS) with generated background noise, not on phone recordings of
  people under stress; English only with US speakers (and synthetic Indian voices).
- One model size (3B, 4-bit). Larger models weren't tried: they didn't fit in memory on this 8 GB laptop
  (docs/architecture.md decision history).

## 7. Reproduce

```bash
npm run setup-ai                          # once, on the server laptop
npx tsx eval/run.ts                       # main set: keywords + AI + duplicate pairs
npx tsx eval/run.ts --data heldout        # held-out set
npx tsx eval/prompt-experiment.ts         # prompt variants (≈20 min on an M2)
npx tsx eval/bench.ts                     # latency
npm run eval:asr -- synth                 # speech engines: synthetic clips (macOS voices)
npm run eval:asr -- fleurs                # …or 25 real FLEURS recordings per language
npm run eval:asr -- record ta             # …or record real ones (ta / hi / en)
npm run eval:asr -- compare [dir]         # score every engine on the clips
npm run eval:asr -- compare eval/asr/clips-fleurs --noise 5 --engines "before BR-12,hopegrid"   # §5b Run 3
```
Results are written to `eval/results/` (git-ignored). Without the models, `run.ts` reports the keyword baseline
and says the AI was skipped.
