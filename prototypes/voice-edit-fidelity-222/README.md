# prototypes/voice-edit-fidelity-222

Throwaway spike for [issue #222](https://github.com/Nabzx/openstream/issues/222):
can a prompted local rewrite model follow a spoken edit command faithfully enough
to ship voice editing ([#17](https://github.com/Nabzx/openstream/issues/17))?

**Answer: no, not with SmolLM2-1.7B.** See `RESULTS.md`.

## Files

| | |
| --- | --- |
| `corpus.json` | 15 selection + spoken-command cases: tested-core, preservation (the #24 meaning-drift risk), adversarial (over-reach, questions, no-ops). |
| `prompts.mjs` | Three prompt variants — `zero-shot`, `strict`, `one-shot`. |
| `guards.mjs` | The deterministic guards from #17's decision (empty / >3× length / chatter-prefix). |
| `run.mjs` | `node run.mjs --url <chat-completions-url>` → runs every variant × case, writes `results.json`. Does not start a server. |
| `review.mjs` | `node review.mjs > review.html` → static page for hand-judging faithfulness. |
| `results.json`, `review.html` | The 2026-08-28 run. |

## Re-running against another model

`run.mjs` only needs a URL, so pointing it at a different rewrite model server
(Qwen3-1.7B, Granite-3.3-2B, … per #192) is a one-command re-test.
