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

## 6. Limitations

- Synthetic, author-written data; no real reports; no native-speaker review; one labeller.
- Small samples: differences under ~10 points are within noise.
- Speech was tested with text-to-speech audio, not real phone recordings with background noise.
- One model size (3B, 4-bit). Larger models weren't tried: they didn't fit in memory on this 8 GB laptop
  (docs/architecture.md decision history).

## 7. Reproduce

```bash
npm run setup-ai                          # once, on the server laptop
npx tsx eval/run.ts                       # main set: keywords + AI + duplicate pairs
npx tsx eval/run.ts --data heldout        # held-out set
npx tsx eval/prompt-experiment.ts         # prompt variants (≈20 min on an M2)
npx tsx eval/bench.ts                     # latency
```
Results are written to `eval/results/` (git-ignored). Without the models, `run.ts` reports the keyword baseline
and says the AI was skipped.
