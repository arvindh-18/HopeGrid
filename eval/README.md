# eval/ — measuring the AI and the duplicate rules

> **All data in this folder is synthetic.** Every report and pair was written by the project author for testing. None
> of it comes from real people, real emergencies or a pilot. The Tamil and Hindi sentences were written without a
> native-speaker review. Results measure how the system behaves on these examples only.

| File | What it is |
|---|---|
| `reports.jsonl` | 40 short emergency reports (12 English, 10 Tamil, 10 Hindi, 8 mixed Tanglish/Hinglish) with hand-written expected `Extraction` fields |
| `duplicate-pairs.jsonl` | 24 pairs of incidents, each labelled "same real-world situation?" |
| `run.ts` | Accuracy of the keyword extractor and of the local LLM on `reports.jsonl`, plus duplicate precision/recall |
| `bench.ts` | Latency of speech-to-text (+ translation) and of AI structuring on this machine |

Run: `npx tsx eval/run.ts` (add `--no-llm` for the keyword baseline only) and `npx tsx eval/bench.ts`.
Both use the models in `models/` if `npm run setup-ai` installed them, and skip the model parts otherwise.
Results are written to `eval/results/` (git-ignored) and summarised in `docs/evaluation.md`.

## Labelling guide (`reports.jsonl`)

The expected values follow the field definitions the AI is given (`server/ai.ts`, rules.md BR-11), applied literally:

| Field | Rule used for the label |
|---|---|
| `type` | The hazard if one is described (FLOOD, CYCLONE, HEAVY_RAIN, FIRE, BUILDING_COLLAPSE, LANDSLIDE, ROAD_BLOCKED, POWER_OUTAGE). If a cause and its effect both appear (heavy rain → a flooded underpass), the effect that endangers people. If no hazard: PEOPLE_TRAPPED, then MEDICAL, else OTHER. A gas leak is not a listed hazard, so a gas leak with breathing trouble is MEDICAL. |
| `people` | A number of **people** stated with digits or number words ("4 of us", "two children", "ஒருவர்" = one person). `null` when not stated. Families or households are not people counts → `null`. |
| `vulnerable` | An elderly person, child, baby, pregnant woman, disabled person or **sick** person is involved. An injured adult alone is not "vulnerable". |
| `mobilityIssue` | Someone is said to be unable to walk or move by themselves. |
| `trapped` | People are stuck, trapped, buried or cannot get out. |
| `medical` | Someone is injured, bleeding, unconscious, sick or needs medicine. A pregnant woman is also labelled `medical: true`, following the project's own worked example in `server/ai.ts`. |
| `danger` | The situation is getting worse or is immediately dangerous: water rising or entering, fire spreading or burning now, live wires, gas leak, collapse, ongoing landslide or storm damage. |
| `needs` | Derived exactly as BR-11 says: EVACUATION if trapped, or FLOOD/CYCLONE with danger · RESCUE if trapped or rescue is explicitly asked for · MEDICAL if medical · PHYSICAL_HELP if mobilityIssue · FOOD_WATER / SHELTER only if asked for. |

Some reports are deliberately hard: negations ("nobody is hurt", "कोई घायल नहीं"), an instruction hidden in the
text (prompt injection), number words, families instead of people, and cause-and-effect hazards.

## Labelling guide (`duplicate-pairs.jsonl`)

`duplicate: true` means the two reports describe the **same real-world situation** (the scenario says so), judged
independently of HopeGrid's rule. Distances are given in metres (north/east offsets) and time as minutes between
the two reports. Several pairs are chosen because the rule is expected to get them wrong, e.g. two different
houses on the same street, or the same collapse reported four hours later.
