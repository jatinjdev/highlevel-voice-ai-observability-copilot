# Voice-call evaluation corpus

`harper-valley.highlevel.json` contains eight simulated bank contact-center calls from
the Gridspace–Stanford Harper Valley dataset, transformed into the same
`VoiceAiCallEnd` payload shape consumed by this project.

The slice deliberately contains three clean task completions and five calls with
incomplete resolution, incorrect facts, lost context, or mismatched task submissions.
Each case includes a source ID, pinned source revision, caller partner rating, scenario
ground truth, the source's human-corrected reference transcript, and a small
provisional human annotation for the checks this Copilot is expected to flag or clear.

## Rebuild

From the repository root:

```sh
node apps/analysis-worker/evals/build-harper-valley-fixtures.mjs
```

The builder fetches only the selected transcript and metadata JSON files from the
pinned source revision. It does not fetch or redistribute the audio.

## Run

The ordinary test suite validates payload shape, provenance, speaker labels, evidence
coverage, and rubric keys without making an LLM request:

```sh
pnpm --filter @copilot/analysis-worker test
```

The opt-in semantic evaluation uses the same provider configuration as the analysis
worker and compares results with the provisional expectations. It writes a compact
result summary to `evals/results/latest.json`, even when the gate fails:

```sh
pnpm --filter @copilot/analysis-worker eval:corpus
```

To rerun selected calls while calibrating an expectation, pass comma-separated case
IDs without changing the corpus:

```sh
EVAL_CASE_IDS=harper-valley-0002f70f7386445b pnpm --filter @copilot/analysis-worker eval:corpus
```

These annotations are an initial calibration set, not immutable truth. Review every
failure and update an expectation only when the source transcript and scenario facts
justify it. Do not weaken expectations merely to make a model pass.

## Attribution and license

This evaluation slice is adapted from the
[Gridspace–Stanford Harper Valley dataset](https://github.com/cricketclub/gridspace-stanford-harper-valley),
created by Gridspace and Stanford and released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source IDs and direct URLs
are retained in every fixture. The transformation changes speaker labels to
HighLevel-style `bot:` and `human:` lines and wraps the source machine transcript in a
synthetic HighLevel event envelope. The corrected `human_transcript` is retained as an
eval-only reference and is never presented to the analyzer as production evidence.
