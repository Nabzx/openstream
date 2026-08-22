# Model weight licensing for an MIT-licensed installer

Research note resolving issue [#25](https://github.com/Nabzx/openstream/issues/25).

- Researched: 2026-08-22. Every source below was accessed on that date.
- Scope: whisper.cpp binary + ggml whisper weights, and Llama 3.2 3B/1B Instruct GGUF.
- Status: research only. No decision is made here, and `LICENSE`, `README.md` and `ROADMAP.md` were deliberately not touched.

## Direct answer

**Yes for whisper, unconditionally-ish. Yes for Llama 3.2, but only under four hard conditions, and one of those conditions collides with a claim currently in `README.md`.**

Whisper: the whisper.cpp code is MIT, the ggml-converted weight files are published under a declared MIT license, and OpenAI's own Whisper release is MIT on GitHub. Nothing there conflicts with shipping in an MIT installer. Standard MIT attribution (retain copyright + license text) is the only obligation.

Llama 3.2: redistribution is expressly permitted by section 1.a of the Llama 3.2 Community License, and section 1.b.ii shows Meta explicitly contemplates the weights travelling inside an "integrated end user product". But shipping them obliges the project to:

1. Ship a copy of the Llama 3.2 Community License Agreement alongside the weights.
2. Display "Built with Llama" prominently on the website, UI, blogpost, about page, or product documentation.
3. Include the exact attribution string in a `Notice` text file distributed with the copies.
4. Comply with, and be bound by, the Llama 3.2 Acceptable Use Policy, which is incorporated into the license by reference.

The 700-million-monthly-active-user clause is not a problem for this project.

The real finding is not a licence conflict inside the installer. It is that the Llama 3.2 Community License is **not** an OSI-approved open source licence and fails at least two clauses of the Open Source Definition. Combined with the four obligations above, that means the shipped package is not wholly MIT and is not wholly open source, which the current `README.md` does not tell a reader. That is a documentation question for a human, not a legal blocker on redistribution.

### What is REQUIRED vs PROHIBITED vs merely conventional

REQUIRED by the Llama 3.2 licence if we ship the weights:
- Ship the Agreement text (s1.b.i(A)).
- Display "Built with Llama" prominently (s1.b.i(B)).
- The `Notice` file attribution string (s1.b.iii).
- Adhere to the Acceptable Use Policy (s1.b.iv).
- Comply with Meta's brand guidelines when using the "Llama" mark (s5.a).

PROHIBITED:
- Any use listed in the Acceptable Use Policy, including "allow others to use" it for those purposes (see below - this is the clause most awkward for a desktop app).
- Use of any Meta name or mark beyond what s5.a permits.
- Suing Meta over IP in the Llama Materials or their outputs, which auto-terminates the licence (s5.c).

MERELY CONVENTIONAL (not required by any text read here):
- Listing model licences in a `THIRD_PARTY_LICENSES` file. Good practice, and it is a convenient place to satisfy s1.b.i(A) and s1.b.iii, but the licence names a "Notice" text file specifically for the attribution string.
- Naming the app or the installer anything in particular. See the naming analysis below - the rename clause does not reach an application.

## Evidence

### 1. Llama 3.2 Community License

Primary source: <https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/LICENSE> (Meta's own `meta-llama/llama-models` repository), accessed 2026-08-22. The canonical hosted copy at <https://www.llama.com/llama3_2/license/> now 301-redirects to <https://developer.meta.com/ai/llama3_2/license/>; the substance matched. The same text is also served as the gate prompt on `meta-llama/Llama-3.2-3B-Instruct` (HF API `cardData.extra_gated_prompt`, `license: llama3.2`).

Header: `Llama 3.2 Version Release Date: September 25, 2024`.

Grant, s1.a, verbatim:

> a. Grant of Rights. You are granted a non-exclusive, worldwide, non-transferable and royalty-free limited license under Meta's intellectual property or other rights owned by Meta embodied in the Llama Materials to use, reproduce, distribute, copy, create derivative works of, and make modifications to the Llama Materials.

"distribute" is in the grant, so redistribution is permitted. "Llama Materials" is defined to include the trained model weights.

Redistribution conditions, s1.b.i, verbatim:

> i. If you distribute or make available the Llama Materials (or any derivative works thereof), or a product or service (including another AI model) that contains any of them, you shall (A) provide a copy of this Agreement with any such Llama Materials; and (B) prominently display "Built with Llama" on a related website, user interface, blogpost, about page, or product documentation. If you use the Llama Materials or any outputs or results of the Llama Materials to create, train, fine tune, or otherwise improve an AI model, which is distributed or made available, you shall also include "Llama" at the beginning of any such AI model name.

s1.b.ii, verbatim:

> ii. If you receive Llama Materials, or any derivative works thereof, from a Licensee as part of an integrated end user product, then Section 2 of this Agreement will not apply to you.

s1.b.iii, verbatim:

> iii. You must retain in all copies of the Llama Materials that you distribute the following attribution notice within a "Notice" text file distributed as a part of such copies: "Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved."

That string is reproduced byte-for-byte above, including the © symbol, because it is a literal string the project must copy into the Notice file.

s1.b.iv, verbatim:

> iv. Your use of the Llama Materials must comply with applicable laws and regulations (including trade compliance laws and regulations) and adhere to the Acceptable Use Policy for the Llama Materials (available at https://www.llama.com/llama3_2/use-policy), which is hereby incorporated by reference into this Agreement.

s2, the user-count threshold, verbatim:

> 2. Additional Commercial Terms. If, on the Llama 3.2 version release date, the monthly active users of the products or services made available by or for Licensee, or Licensee's affiliates, is greater than 700 million monthly active users in the preceding calendar month, you must request a license from Meta, which Meta may grant to you in its sole discretion, and you are not authorized to exercise any of the rights under this Agreement unless or until Meta otherwise expressly grants you such rights.

Note the test is fixed to the release date (2024-09-25), not to a rolling measurement, and it is measured on the Licensee, so it does not become a future trap as OpenStream grows. It is not triggered here.

s5.a, trademark, verbatim:

> a. No trademark licenses are granted under this Agreement, and in connection with the Llama Materials, neither Meta nor Licensee may use any name or mark owned by or associated with the other or any of its affiliates, except as required for reasonable and customary use in describing and redistributing the Llama Materials or as set forth in this Section 5(a). Meta hereby grants you a license to use "Llama" (the "Mark") solely as required to comply with the last sentence of Section 1.b.i. You will comply with Meta's brand guidelines (currently accessible at https://about.meta.com/brand/resources/meta/company-brand/). All goodwill arising out of your use of the Mark will inure to the benefit of Meta.

s5.c also matters for risk, verbatim in part:

> c. If you institute litigation or other proceedings against Meta or any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Llama Materials or Llama 3.2 outputs or results, or any portion of any of the foregoing, constitutes infringement of intellectual property or other rights owned or licensable by you, then any licenses granted to you under this Agreement shall terminate as of the date such litigation or claim is filed or instituted. You will indemnify and hold harmless Meta from and against any claim by any third party arising out of or related to your use or distribution of the Llama Materials.

The indemnity is worth flagging to a human: distributing the weights means indemnifying Meta against third-party claims arising from that distribution. MIT has no such term.

Governing law is California with exclusive California jurisdiction (s7).

#### Does the naming clause force us to rename OpenStream?

No, on the text as written. The rename sentence in s1.b.i is conditioned on using the Materials "to create, train, fine tune, or otherwise improve an AI model", and the obligation it creates is to prefix "any such AI model name" - the name of the model, not the name of the product carrying it. OpenStream is an application that runs an unmodified model; it does not create, train, or fine-tune one.

Even if quantizing to GGUF were argued to be a derivative model, the point is moot in practice: the community GGUF builds keep the upstream name (`Llama-3.2-3B-Instruct`), which already begins with "Llama". Shipping them under their existing filenames satisfies the clause on any reading.

What is *not* optional either way is s1.b.i(B): "Built with Llama" must appear prominently somewhere user-facing.

### 2. Llama 3.2 Acceptable Use Policy

Primary source: <https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/USE_POLICY.md>, accessed 2026-08-22. Hosted copy: <https://www.llama.com/llama3_2/use-policy> (redirects to <https://developer.meta.com/ai/llama3_2/use-policy/>).

The single most awkward clause for a local desktop app, verbatim:

> We want everyone to use Llama 3.2 safely and responsibly. You agree you will not use, **or allow others to use**, Llama 3.2 to: [...]

(Emphasis is Meta's own markdown bolding in the source.)

The prohibited-use list is field-of-use restrictive, and covers among others: violence or terrorism; child exploitation; harassment; "the unauthorized or unlicensed practice of any profession including, but not limited to, financial, legal, medical/health, or related professional practices"; malware creation; "Military, warfare, nuclear industries or applications, espionage"; "Guns and illegal weapons (including weapon development)"; "Illegal drugs and regulated/controlled substances"; "Operation of critical infrastructure, transportation technologies, or heavy machinery"; fraud and disinformation; spam; impersonation; and "Representing that the use of Llama 3.2 or outputs are human-generated".

Two further obligations sit outside the prohibition list:

> 4. Fail to appropriately disclose to end users any known dangers of your AI system

and an EU carve-out, verbatim:

> With respect to any multimodal models included in Llama 3.2, the rights granted under Section 1(a) of the Llama 3.2 Community License Agreement are not being granted to you if you are an individual domiciled in, or a company with a principal place of business in, the European Union. This restriction does not apply to end users of a product or service that incorporates any such multimodal models.

That EU restriction is limited to the *multimodal* Llama 3.2 models (11B/90B Vision). The 1B and 3B text models planned here are not multimodal, so on its face it does not apply to them. Flagged as an interpretation, not a quoted exemption.

**Pass-through:** I found no clause in the AUP or in the licence that requires the AUP text to be shown to, or accepted by, end users. What exists instead is the "or allow others to use" wording above, which places the compliance burden on us for what our users do with the model we hand them. A fully local, offline dictation app has no technical means to enforce that. This is a genuine tension worth a human decision, and it is precisely the kind of clause an MIT project does not otherwise carry. Note that s1.b.i(A) does require the *Agreement* to travel with the Materials, and the Agreement incorporates the AUP by reference, so shipping the licence text effectively puts the AUP in front of the user even though nothing demands it explicitly.

### 3. Is Llama 3.2 open source?

No, not in the OSI sense.

- The OSI approved licence list at <https://opensource.org/licenses> (accessed 2026-08-22) contains no Llama or Meta licence. Verified by fetching the page and grepping: zero occurrences of "llama" and zero of "Meta Platforms", while control terms such as "Apache License, Version 2.0" and "MIT License" are present. This establishes absence from the list, not a published OSI ruling on Llama specifically.
- The Open Source Definition at <https://opensource.org/osd> (accessed 2026-08-22), clause 6, verbatim:

  > 6. No Discrimination Against Fields of Endeavor. The license must not restrict anyone from making use of the program in a specific field of endeavor. For example, it may not restrict the program from being used in a business, or from being used for genetic research.

  The AUP restricts exactly that: military, weapons, critical infrastructure, licensed professional practice. Llama 3.2 fails OSD clause 6.
- OSD clause 7, verbatim:

  > 7. Distribution of License. The rights attached to the program must apply to all to whom the program is redistributed without the need for execution of an additional license by those parties.

  Section 2 of the Llama licence requires certain recipients (those above 700M MAU) to obtain a separate licence from Meta before exercising any rights. Llama 3.2 arguably fails clause 7 as well. Section 1.b.ii softens this for end users of an integrated product, but not for downstream redistributors.

**Consequence for the README.** I read `README.md` on the current `main` (commit `45d7356`) to check this directly, and the exact phrase "completely free and open source" that framed this ticket **does not appear there**. What the README actually says, verbatim:

> A free, fully local, zero-setup voice dictation app for macOS - built specifically for developers.

(The original uses an em dash where a plain dash appears above; this file follows the repo's plain-dash convention.)

and, under "License":

> [MIT](LICENSE)

So the README makes no explicit open source claim about the shipped package. "Free" as used there reads as free-of-charge, which stays true regardless of the Llama terms. The residual accuracy problem is narrower but real: a `## License` section that says only "MIT", in a README that in the same document commits to shipping Llama 3.2 3B, invites a reader to conclude the whole delivered package is MIT. It is not. Nothing in the README currently discloses that a bundled component carries Meta's community licence plus an acceptable use policy.

The `LICENSE` file itself is fine as-is - MIT covers our code, and a separate third-party component under its own terms is ordinary aggregation, not a conflict. A likely fix is a sentence in the License section naming the model licences, but choosing between disclosing, swapping the model, or both is left to a human per the ticket.

Two adjacent inconsistencies noticed while reading the README, flagged because they touch this ticket without being part of it:

- The README states both that the models "ship bundled with the installer" (feature 4, "Actually zero setup") and that they are "downloaded at build/first-run" (Planned architecture, twice). Those are the two options issue #30 is meant to decide between, and the README currently asserts both.
- If the bundled reading wins, the "Built with Llama" requirement of s1.b.i(B) has an obvious home in the README or the app's about panel. Neither carries it today.

### 4. whisper.cpp code and whisper model weights

These are two separate artefacts and were checked separately. Both are permissive.

| Artefact | Declared licence | Primary source (accessed 2026-08-22) |
| --- | --- | --- |
| whisper.cpp source/binary | MIT, "Copyright (c) 2023-2026 The ggml authors" | <https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE> |
| ggml-converted whisper weight files | `license: mit` in the model card front matter | <https://huggingface.co/ggerganov/whisper.cpp/raw/main/README.md> and HF API `cardData` for `ggerganov/whisper.cpp` |
| Upstream OpenAI Whisper | MIT License, "Copyright (c) 2022 OpenAI" | <https://raw.githubusercontent.com/openai/whisper/main/LICENSE> |
| OpenAI Whisper weights on HF | `apache-2.0` | HF API `cardData.license` for `openai/whisper-large-v3` and `openai/whisper-base` |

Note the inconsistency in the last two rows: OpenAI's GitHub repository is MIT, while OpenAI's own Hugging Face weight repositories declare Apache 2.0, and the ggml conversions declare MIT. All three are permissive and all three permit redistribution with attribution, so the practical answer is unaffected. But the `mit` tag on the ggml files is a declaration by the converter (the ggml authors), not by OpenAI, and there is no licence text embedded inside the `.bin` weight files themselves. See the unverified list.

Practical obligation: retain the MIT copyright notice and licence text for whisper.cpp and for the ggml weights, and the Apache 2.0 notice if pulling weights from OpenAI's HF repos. There is no "Built with" requirement, no naming requirement, no acceptable-use policy, and no user threshold.

### 5. Bundled in the installer vs downloaded on first run (issue #30)

**The licence texts draw no distinction between the two.** Nothing in the Llama 3.2 Community License, the AUP, or the whisper licences turns on delivery mechanism.

Section 1.b.i binds anyone who "distribute[s] **or make[s] available** the Llama Materials (or any derivative works thereof), **or a product or service (including another AI model) that contains any of them**". An installer that bundles the weights plainly distributes them. An app that fetches them on first run makes them available, and arguably ships a product that contains them by design. Both readings land inside the clause, so **both paths trigger the full obligation set**: Agreement copy, "Built with Llama", Notice file, AUP adherence.

There is one real asymmetry, and it is operational rather than legal:

- `meta-llama/Llama-3.2-3B-Instruct` on Hugging Face is `gated: manual` (HF API `gated` field, accessed 2026-08-22). Fetching from Meta's own repository requires an accepted gate and an access token, so a first-run download straight from Meta's repo is not viable without each user (or the project) holding credentials.
- Third-party GGUF conversions such as `bartowski/Llama-3.2-3B-Instruct-GGUF` and `unsloth/Llama-3.2-3B-Instruct-GGUF` are **ungated** and declare `license: llama3.2` (HF API, accessed 2026-08-22). These are downloadable without credentials, and they carry the same Llama licence obligations onward.

So the choice between bundling and downloading is a size, latency, and hosting decision, not a licensing one. If the download path is chosen, the source repo's gating status is the constraint to check, not the licence.

For whisper, no gating and no distinction either. `ggerganov/whisper.cpp` is ungated.

## Alternatives, if Llama 3.2 is judged unacceptable

Genuinely permissive instruct-tuned models in the 1B-4B range with GGUF builds available. Licence is what makes each of these different from Llama: Apache 2.0 and MIT are both OSI-approved, impose no acceptable-use restrictions, no "Built with" display requirement, no naming requirement, and no user thresholds. Attribution obligations are the ordinary ones (retain notices; Apache 2.0 additionally requires a NOTICE file be propagated if one is present).

| Model | Params | Declared licence | GGUF repo checked | Verification level |
| --- | --- | --- | --- | --- |
| Qwen/Qwen3-1.7B | 1.7B | Apache 2.0 | `Qwen/Qwen3-1.7B-GGUF` (`apache-2.0`), `ggml-org/Qwen3-1.7B-GGUF` (`apache-2.0`) | **Licence file read directly** - <https://huggingface.co/Qwen/Qwen3-1.7B/raw/main/LICENSE> is the verbatim Apache License 2.0 text |
| HuggingFaceTB/SmolLM2-1.7B-Instruct | 1.7B | Apache 2.0 | `HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF` (`apache-2.0`) | Model card front matter read directly (`license: apache-2.0`) |
| Qwen/Qwen2.5-1.5B-Instruct | 1.5B | Apache 2.0 | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` (`apache-2.0`) | Declared metadata + `license_link` present; full file not read |
| Qwen/Qwen3-4B-Instruct-2507 | 4B | Apache 2.0 | not checked | Declared metadata only |
| ibm-granite/granite-3.3-2b-instruct | 2B | Apache 2.0 | `ibm-granite/granite-3.3-2b-instruct-GGUF` (`apache-2.0`) | Declared metadata only |
| microsoft/Phi-4-mini-instruct | 3.8B | MIT | `unsloth/Phi-4-mini-instruct-GGUF` (`mit`) - third party | Declared metadata only; no first-party Microsoft GGUF found |
| microsoft/Phi-3.5-mini-instruct | 3.8B | MIT | not checked | Declared metadata only |

Two traps found while checking, both worth repeating to whoever picks:

- **Qwen2.5-3B-Instruct is NOT Apache 2.0.** Its HF metadata says `license: other`, and the actual file at <https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/raw/main/LICENSE> is the "Qwen RESEARCH LICENSE AGREEMENT" (release date 2024-09-19). The sibling 1.5B model *is* Apache 2.0. Within one model family, per-size licences differ. Read the file for the exact size you intend to ship.
- **Gemma is not permissive either.** `google/gemma-3-4b-it` declares `license: gemma` and is `gated: manual` (HF API, 2026-08-22). It is in the same category as Llama for this purpose, not a solution to it.

No recommendation is made here on which model to choose; that is the human decision the ticket reserves.

## What I could NOT verify

Stated plainly, because the ticket asks for it.

1. **Whether `README.md` on any branch other than current `main` says something different.** I verified the wording against the working tree at commit `45d7356` only. The phrase "completely free and open source" that this ticket was written around is not present there; if it exists, it is somewhere I did not look (a draft, a website, an issue body).
2. **Whether the ggml whisper weight conversions are validly MIT.** The `license: mit` tag on `ggerganov/whisper.cpp` is a declaration by the converter, not by OpenAI, and the `.bin` files carry no embedded licence. OpenAI's own HF weight repos say `apache-2.0` while OpenAI's GitHub repo says MIT. All permissive, so the conclusion holds either way, but the exact chain of title on those specific converted files was not established.
3. **Whether OSI has ever ruled on the Llama licence.** I established only that no Llama or Meta licence appears on <https://opensource.org/licenses>. That is absence from the approved list, which is sufficient for "not OSI-approved", but it is not an OSI statement about Llama.
4. **The EU multimodal carve-out's application to 1B/3B.** The AUP text restricts the carve-out to "any multimodal models included in Llama 3.2". That the 1B and 3B text models are outside it is my reading from the models being text-only, not a quoted exemption naming them.
5. **`meta-llama/Llama-3.2-3B-Instruct/LICENSE.txt` was not fetched directly** - it returned HTTP 401 because the repo is gated. The licence text used here came from Meta's public `meta-llama/llama-models` GitHub repository and was cross-checked against the gate prompt served by the HF API for that gated repo; they matched.
6. **Most alternative-model licences were verified from declared metadata only**, as marked in the table. Only Qwen3-1.7B (full Apache 2.0 file) and SmolLM2-1.7B-Instruct (card front matter) were read directly. The Qwen2.5-3B finding shows metadata alone is not always enough - read the actual file for whichever model is finally chosen.
7. **No first-party Microsoft GGUF build of Phi-4-mini was found.** `microsoft/Phi-4-mini-instruct-gguf` returned an auth error from the HF API, likely meaning it does not exist under that name. The MIT-declared GGUF found is `unsloth/Phi-4-mini-instruct-GGUF`, a third-party conversion.
8. **This is not legal advice.** It is a reading of licence texts by an engineer. The indemnity in section 5.c and the "allow others to use" wording in the AUP are the two clauses where a lawyer's read would add the most value.

## Sources

All accessed 2026-08-22.

- Llama 3.2 Community License: <https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/LICENSE> (hosted: <https://developer.meta.com/ai/llama3_2/license/>, redirected from <https://www.llama.com/llama3_2/license/>)
- Llama 3.2 Acceptable Use Policy: <https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/USE_POLICY.md> (hosted: <https://developer.meta.com/ai/llama3_2/use-policy/>)
- whisper.cpp LICENSE: <https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE>
- ggml whisper weights card: <https://huggingface.co/ggerganov/whisper.cpp/raw/main/README.md>
- OpenAI Whisper LICENSE: <https://raw.githubusercontent.com/openai/whisper/main/LICENSE>
- OSI approved licence list: <https://opensource.org/licenses>
- Open Source Definition: <https://opensource.org/osd>
- Qwen3-1.7B LICENSE: <https://huggingface.co/Qwen/Qwen3-1.7B/raw/main/LICENSE>
- Qwen2.5-3B-Instruct LICENSE: <https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/raw/main/LICENSE>
- SmolLM2-1.7B-Instruct card: <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/raw/main/README.md>
- Hugging Face model metadata API (`license`, `gated`, `license_link` fields): `https://huggingface.co/api/models/{repo}`
