# Public datasets for Voice AI call-analysis evals

Research date: 2026-07-16

## Recommendation

Use a small, attributed subset of **HarperValleyBank (HVB)** as the first checked-in call-analysis eval corpus. It is the closest match to the product: actual simulated contact-center telephone calls rather than written chat, with caller/agent speaker roles, machine and corrected transcripts, segment and word timing, task metadata, and call-level survey data.

Supplement HVB with a few **ABCD** conversations when testing whether the analyzer recognizes required workflow actions and policy adherence. Later, use **tau3-bench / tau-voice** as an integration benchmark that generates new customer-service trajectories with verifiable task outcomes; it is not a drop-in static transcript corpus.

Do not present any source's model-produced emotion scores as ground-truth customer sentiment. For the small golden suite, manually review and version the expected findings and Recommendations.

## 1. HarperValleyBank — primary fixture source

| Property             | Assessment                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Fit                  | Best available match for transcript-level Voice AI observability                                                                      |
| Content              | 1,446 human-human simulated bank contact-center calls, about 23 hours, 59 speakers                                                    |
| Domains/tasks        | Replace card, transfer money, check balance, order checks, pay bill, reset password, schedule appointment, branch hours               |
| Transcript structure | Per-segment caller/agent role, machine transcript, corrected human transcript, segment start/duration, machine word offsets/durations |
| Other metadata       | Assigned task, submitted task response, speaker IDs, intelligibility/MOS labels, caller partner rating, separate caller/agent audio   |
| License              | CC BY 4.0; commercial reuse, adaptation, and redistribution are permitted with attribution, license link, and modification notice     |
| Pin                  | `0bd721e877c4a85d8c13ff837e68661ea6200a98`                                                                                            |

Primary sources:

- [Official repository](https://github.com/cricketclub/gridspace-stanford-harper-valley)
- [Dataset schema and field definitions](https://raw.githubusercontent.com/cricketclub/gridspace-stanford-harper-valley/master/README.md)
- [Dataset paper](https://arxiv.org/abs/2010.13929)
- [CC BY 4.0 license text](https://raw.githubusercontent.com/cricketclub/gridspace-stanford-harper-valley/master/LICENSE)
- [Example transcript](https://raw.githubusercontent.com/cricketclub/gridspace-stanford-harper-valley/master/data/transcript/0002f70f7386445b.json)
- [Example call metadata](https://raw.githubusercontent.com/cricketclub/gridspace-stanford-harper-valley/master/data/metadata/0002f70f7386445b.json)

### What it can test well

- **Transcript fidelity and keyword boosting candidates:** evaluate the analyzer using the machine `transcript`; retain `human_transcript` as the reference. The example source call transcribes “this is harper valley” as “mr harper valley” and the agent name “Elizabeth” as “Alyssa,” illustrating the kind of named-entity error the product should surface.
- **Speaker-specific evidence:** `speaker_role` is explicitly `agent` or `caller`, so evaluator findings can point to the correct participant and segment.
- **Task understanding and outcome evidence:** metadata provides the assigned task and submitted responses. These are better anchors for expected outcomes than unconstrained LLM opinion.
- **Conversation-map evidence:** the source includes segment and word timing. Preserve this only in fixture provenance; a normalized HighLevel transcript should not pretend HighLevel supplied timing that its webhook did not provide.
- **Call-level quality slicing:** intelligibility/MOS labels and partner ratings permit choosing a deliberately diverse small subset.

### What is not ground truth

The repository explicitly describes `emotion` and `dialog_acts` as outputs from Gridspace models. They are useful weak labels or stratification signals, but they must not be used as unquestioned gold labels for sentiment, empathy, problematic language, or expected Recommendations. The call's task, corrected transcript, timestamps, submitted task responses, and survey data are stronger evidence. Human-reviewed expected findings should be stored separately from the imported source record.

### Proposed small checked-in subset

Start with 24 calls: three calls from each of the eight task types. Within each task, deliberately select:

1. one high-quality, straightforward completion;
2. one call with meaningful machine-versus-human transcript differences;
3. one lower partner-rating/MOS or less straightforward call.

This gives task coverage and useful failure diversity without checking in the full audio corpus. The selection should be deterministic and recorded in a manifest with source SID and pinned commit.

### HighLevel-compatible normalization

Normalize imported records through a clearly named adapter rather than altering source data in place. A fixture should resemble the production `VoiceAiCallEnd` boundary while retaining source provenance:

```json
{
  "type": "VoiceAiCallEnd",
  "id": "eval-hvb-0002f70f7386445b",
  "locationId": "eval-location-hvb",
  "agentId": "eval-agent-hvb-banking",
  "createdAt": "2020-06-02T00:13:03.191Z",
  "duration": 51.203,
  "transcript": "Agent: hello mr harper valley national bank\nAgent: my name is alyssa\nAgent: how can i help you today\nCustomer: hi",
  "summary": "HVB simulated banking call: replace card",
  "actions": [],
  "trialCall": true,
  "evalProvenance": {
    "sourceDataset": "harper-valley-bank",
    "sourceId": "0002f70f7386445b",
    "sourceRevision": "0bd721e877c4a85d8c13ff837e68661ea6200a98",
    "taskType": "replace card",
    "license": "CC-BY-4.0"
  }
}
```

Mapping rules:

- `id`: `eval-hvb-${sid}`
- `createdAt`: ISO representation of metadata `start_time_ms`
- `duration`: `(end_time_ms - start_time_ms) / 1000`
- `transcript`: ordered segments using `transcript`, mapping `agent` to `Agent` and `caller` to `Customer`
- reference transcript: construct identically with `human_transcript`, but store it only in eval expectations/provenance, not as the evaluator input
- `summary`: source dataset plus `tasks[0].task_type`; do not invent an outcome summary
- `actions`: empty because source dialog-act predictions are not HighLevel action executions
- `trialCall`: true, so fixtures cannot be confused with customer data

If the application schema cannot accept `evalProvenance`, keep it in a sidecar manifest keyed by event ID.

### Attribution requirements

Any redistributed subset needs an attribution/NOTICE entry naming HarperValleyBank and its creators, linking the source and CC BY 4.0 license, and stating that the records were transformed into HighLevel-shaped fixtures. Preserve source SIDs. Do not imply Gridspace or Stanford endorses this product.

## 2. ABCD — supplemental policy/action fixtures

| Property  | Assessment                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fit       | Excellent for scripted workflow, policy, intent, action, and task-resolution checks; not a voice corpus                                        |
| Content   | More than 10,000 human-human customer-service dialogues with 55 user intents                                                                   |
| Structure | `agent`, `customer`, and `action` turns; fictional scenario; flow/subflow; guidelines; next-step, action, value-filling, and utterance targets |
| License   | MIT, including use, modification, publication, and distribution with copyright/license notice                                                  |
| Pin       | `6b8700ce67c6b37b062dd7a60abc76d7ef832a97`                                                                                                     |

Primary sources:

- [Official ABCD repository](https://github.com/asappresearch/abcd)
- [Dataset description and schema](https://github.com/asappresearch/abcd/blob/6b8700ce67c6b37b062dd7a60abc76d7ef832a97/README.md)
- [MIT license](https://raw.githubusercontent.com/asappresearch/abcd/6b8700ce67c6b37b062dd7a60abc76d7ef832a97/LICENSE)
- [ABCD paper](https://arxiv.org/abs/2104.00783)

ABCD is especially useful for testing whether recommendations are grounded in an actually available action and whether the analyzer recognizes omitted or incorrectly ordered policy steps. Its scenarios use fictional customer information, and its explicit action turns make stronger deterministic expectations possible than sentiment-only datasets.

Limitations:

- It is typed live chat, not speech or ASR output.
- It has no reliable gold customer-sentiment, empathy, or problematic-language labels.
- A converted ABCD fixture must be labelled supplemental and must not be used to claim voice/transcription fidelity.

## 3. Taskmaster-1 and Taskmaster-2 — spoken-language diversity

| Property  | Assessment                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Fit       | Useful secondary source for realistic spoken phrasing and transcription noise; weaker customer-support/policy fit                  |
| Content   | Taskmaster-1 has 13,215 dialogs, including 5,507 spoken; Taskmaster-2 has 17,289 entirely spoken two-person dialogs                |
| Domains   | Restaurant, food/pizza/coffee ordering, flights, hotels, movies, ride service, auto repair, sports, music                          |
| Structure | Ordered `USER`/`ASSISTANT` utterances with span annotations; Taskmaster-1 also includes API-argument and accept/reject annotations |
| License   | CC BY 4.0 for both TM-1 and TM-2; attribution is required                                                                          |
| Pin       | `d92cb6af3005f1dc09c39e75e7daf4a04905e00b`                                                                                         |

Primary sources:

- [Official Taskmaster repository](https://github.com/google-research-datasets/Taskmaster)
- [Taskmaster-1 source README and license notice](https://raw.githubusercontent.com/google-research-datasets/Taskmaster/d92cb6af3005f1dc09c39e75e7daf4a04905e00b/TM-1-2019/README.md)
- [Taskmaster-2 source README and license notice](https://raw.githubusercontent.com/google-research-datasets/Taskmaster/d92cb6af3005f1dc09c39e75e7daf4a04905e00b/TM-2-2020/README.md)
- [Taskmaster-1 paper](https://research.google/pubs/taskmaster-1-toward-a-realistic-and-diverse-dialog-dataset/)

The official documentation says user turns in spoken dialogs were transcribed from recordings and may retain typos, misspellings, non-standard phrasing, and disfluencies. That makes Taskmaster useful for robustness probes. It does not provide dependable sentiment, empathy, escalation, or customer-service policy labels, so it should not be the primary golden suite.

## 4. tau3-bench / tau-voice — later integration benchmark

| Property     | Assessment                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Fit          | Best framework for generating new task-grounded customer-service voice trajectories and testing end-to-end task completion |
| Content      | Retail, airline, telecom, banking-knowledge and mock domains; domain policy, tools, user task, and evaluation criteria     |
| Voice mode   | Full-duplex agent/user audio with controllable accents, noise, and turn-taking behavior                                    |
| Labels       | Verifiable task/action outcomes plus voice-interaction metrics                                                             |
| License      | MIT                                                                                                                        |
| Pin reviewed | `a1e85084a3960281cb06997594133e8f39ea42a7`                                                                                 |

Primary sources:

- [Official tau3-bench repository](https://github.com/sierra-research/tau2-bench)
- [Repository overview and voice documentation index](https://github.com/sierra-research/tau2-bench/blob/a1e85084a3960281cb06997594133e8f39ea42a7/README.md)
- [MIT license](https://raw.githubusercontent.com/sierra-research/tau2-bench/a1e85084a3960281cb06997594133e8f39ea42a7/LICENSE)
- [tau-voice paper](https://arxiv.org/abs/2603.13686)

The tau-voice paper evaluates 278 grounded tasks and explicitly combines task completion, policy adherence, environment interaction, and voice dynamics. This maps well to future system-level regression tests. However, the repository is a benchmark/simulator, not a ready-made corpus of HighLevel transcript fixtures. Running it also requires voice-model infrastructure and provider credentials. Use HVB first; add tau3-bench after the local analyzer and golden fixture runner are stable.

## Other candidates considered

### Schema-Guided Dialogue

[Google's Schema-Guided Dialogue dataset](https://github.com/google-research-datasets/dstc8-schema-guided-dialogue) contains more than 20,000 annotated task-oriented user/assistant conversations, API/service calls, state, actions, and success/failure acts. It is helpful for generic service-call reasoning but is simulated text, not voice or customer-support calls. Its [CC BY-SA 4.0 license](https://github.com/google-research-datasets/dstc8-schema-guided-dialogue/blob/master/LICENSE.txt) also adds share-alike obligations. ABCD is a cleaner supplemental choice here.

### SpokenWOZ

[SpokenWOZ](https://spokenwoz.github.io/SpokenWOZ-github.io/) is a large spoken task-oriented corpus, but its CC BY-NC 4.0 restriction makes it a poor choice for fixtures checked into a hiring assignment intended to demonstrate a potentially commercial Marketplace app. Do not vendor it without an explicit decision that the usage is non-commercial and compatible.

### Emotional Support Conversation

[ESConv](https://github.com/thu-coai/Emotional-Support-Conversation) includes strategy-labelled emotional-support dialogues and negative samples, but the official repository states that data and code are for academic research only. It is also not customer service. Do not redistribute it in this project.

### Small or synthetic Hugging Face customer-service uploads

Several community uploads advertise sentiment, CSAT, resolution, or escalation labels. Many are recently generated, have ambiguous or contradictory licensing language, lack a peer-reviewed collection methodology, or expose model-authored labels as if they were ground truth. They are less defensible in a manual code review than HVB, ABCD, Taskmaster, and tau3-bench.

## Expected-label strategy for this project

The public data is the input corpus, not the finished eval oracle. Create a separate, versioned expectation record for every selected call:

```json
{
  "fixtureId": "eval-hvb-0002f70f7386445b",
  "reviewVersion": 1,
  "observableFacts": {
    "taskType": "replace card",
    "referenceTranscriptAvailable": true
  },
  "expectedFindings": [
    {
      "check": "transcription_fidelity",
      "status": "review",
      "sourceSegment": 1,
      "reason": "Machine transcript changes the bank greeting."
    }
  ],
  "expectedRecommendations": [],
  "reviewedBy": "human",
  "notes": "Emotion and dialog-act model outputs were not treated as gold labels."
}
```

Use categorical expectations rather than a weighted overall score:

- whether a finding should be `clear`, `review`, `critical`, `not_applicable`, or `not_observable`;
- which source segment supports it;
- whether a Recommendation is warranted;
- the valid recommendation target, such as prompt, knowledge base, keyword boosting, an existing call action, or human review;
- explicit non-expectations, especially when the source data cannot support the check.

This separates three different questions that should not be conflated:

1. **Did the analyzer extract the observable fact correctly?**
2. **Did it decide sensibly whether a human should look at it?**
3. **Did it recommend only a configuration change that actually exists and is supported by the evidence?**

## Implementation order

1. Pin and download only the selected HVB transcript and metadata JSON files.
2. Add the CC BY 4.0 attribution/NOTICE and a deterministic source manifest.
3. Convert the source machine transcripts into the production HighLevel event boundary; keep corrected transcripts in eval-only expectations.
4. Human-review the 24 calls and author categorical expected findings/Recommendations.
5. Run every fixture through the same ingestion and analysis service used by production, under an isolated eval tenant/location/agent.
6. Report per-check precision/recall and evidence-line accuracy; do not collapse results into an overall customer-facing score.
7. Add a small ABCD supplemental suite for policy/action cases.
8. Add tau3-bench generated trajectories only after the static suite is stable.
