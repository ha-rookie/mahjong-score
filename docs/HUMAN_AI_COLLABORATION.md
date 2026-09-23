# Human / AI Collaboration Guardrails

## Purpose

This document defines cross-project guardrails for collaboration between the Human owner and ChatGPT/AI when working with GitHub, binary assets, and generative design work.

These rules are **not application-specific**. They apply to every Repository and project that uses this template.

Repository-specific design rules may add constraints, but must not silently weaken these guardrails.

## STOP Gate

Before any GitHub handoff, binary Asset operation, or generative image action, AI must check the applicable rules below. If a STOP condition is met, do not continue to the action.

## GR-001 GitHub URL presentation

When presenting a GitHub URL to the Human:

- Do not use Markdown links.
- Do not use clickable/rich URL formatting.
- Put the raw GitHub URL in a fenced code block so it can be copied and opened in a browser without intentionally invoking the GitHub app.
- This applies across all repositories and projects.

**STOP:** If the GitHub URL is about to be emitted as a clickable link, stop and convert it to a raw URL in a code block.

## GR-002 Binary files use Human Upload by default

For images and other binary files, do not assume AI can reliably upload the file to GitHub.

Default flow:

1. AI creates or identifies the Issue-specific branch.
2. AI creates the upload destination folder when a folder must exist first.
3. AI tells the Human the branch, folder, expected filenames, and copyable raw GitHub URL.
4. Human uploads the binary files.
5. Human reports completion.
6. AI verifies the actual files in GitHub before continuing.
7. AI records hash/SHA/dimensions/format when required by the Asset workflow.

Do not repeatedly retry AI-side binary upload merely because a connector/API exposes a possible transport route.

**STOP:** If AI is about to choose direct binary upload as the default path, stop and use Human Upload.

## GR-003 Image generation requires explicit approval

Do not generate a new image merely because an image may be useful.

Before generation, confirm that the Human has explicitly requested/approved generation and that the intended direction is sufficiently agreed:

- purpose
- composition / primary subject
- required and prohibited elements
- color / brightness / texture
- text presence
- size / aspect ratio
- relationship to existing design
- scope of the current iteration

If the Human explicitly says to create/generate the already-agreed image, generation may proceed.

**STOP:** No explicit generation approval, or unresolved material design direction -> do not invoke image generation.

## GR-004 “Continue” is scoped

“Continue” authorizes continuation of the currently agreed workflow. It does not automatically authorize:

- a new visual concept
- a new image
- a new destructive GitHub operation
- Production release
- Merge where Human approval is required
- expansion into a different project/scope

**STOP:** If continuation crosses one of these boundaries, obtain the required Human decision first.

## GR-005 Do not re-ask after Human Upload

When the Human says an upload is complete:

- inspect GitHub first
- do not ask the Human to upload again unless verification actually fails
- distinguish “not found,” “wrong branch/path,” and “connector limitation”

## GR-006 Repository rules and collaboration rules are separate

Repository documentation defines product architecture, file placement, build/deploy behavior, and project-specific constraints.

This document defines Human/AI collaboration behavior.

Do not rewrite a collaboration preference as an application architecture decision. If both apply, satisfy both.


## GR-007 External capability / quota limitation

When a required external capability is unavailable because of quota, billing, permission, service outage, plan limitation, or another execution constraint, do not treat the dependent verification as successful or completed.

Examples include GitHub Actions, Cloudflare deployment/Preview, connectors, and other external execution services. A capability limitation also includes a case where the currently available Tool / Connector does not provide the requested operation at all.

Before asking the Human to approve an operation, first verify that the currently available AI Tool / Connector can actually perform that operation after approval. Human approval does not create a capability that the AI does not have.

During a limitation:

1. identify the unavailable capability and affected repositories/workflows
2. continue only work that does not depend on that capability, such as design, code changes, documentation, and static review where appropriate
3. record each dependent check as **unverified / not executed**
4. distinguish a limitation from an implementation failure
5. keep a clear re-verification queue for after the limitation is removed
6. do not claim CI, Preview, deployment, smoke test, or other dependent checks passed when they did not run
7. do not use an unexecuted check as evidence for a Human approval gate, Merge gate, or Production decision that requires that check

A limitation in one repository or service must not be generalized to another repository without checking whether the same limitation actually applies there.

**STOP:** If AI is about to ask for Human approval while the post-approval operation has not been verified as available to the current Tool / Connector, verify capability first. If the operation is unavailable, state that limitation instead of implying that approval would make execution possible.

**STOP:** If a required gate depends on a currently unavailable capability, stop at that gate. Do not label the work verified or complete. Resume the blocked verification after the limitation is removed.

## GR-008 Evidence-based work resumption / Recognition mismatch

When resuming work after a new chat, interruption, context loss, or a Human/AI recognition mismatch, do not decide the current state from conversation memory, a single search result, or an Issue state alone.

Evidence reconciliation:

1. prefer a known direct reference such as path, SHA, Issue, Branch, or PR over a broad search result
2. inspect the Issue / Change Contract
3. inspect the corresponding Branch / PR and actual changed files
4. compare with main and determine whether the change is merged
5. compare main with the current Notion design/state when the design or operational meaning is relevant
6. inspect Google Drive only when working data or generated output is relevant
7. return to Box only when immutable original/raw evidence must be verified

Search is a discovery mechanism. A zero-result search is not, by itself, proof that a known file, rule, implementation, or historical work does not exist.

When the Human says or clearly indicates “that is different,” “we did that before,” “that should already be implemented,” or another recognition mismatch, stop extending the current assumption and reconcile the direct evidence first.

Distinguish at least:

- not found
- wrong path/ref/branch
- search/index limitation
- connector/capability limitation
- unmerged implementation
- merged implementation
- Notion synchronization lag

**STOP:** If AI is about to claim “does not exist,” “not implemented,” “not started,” or an equivalent state from memory, search results, or Issue state alone while stronger direct evidence can be checked, stop and perform evidence reconciliation first.

## Recurrence handling

When the Human reports a repeated violation:

1. identify the violated GR-ID
2. identify why the STOP gate failed
3. strengthen the guardrail or its mandatory entry point
4. do not merely add another duplicate rule
5. verify related templates/documents for conflicting instructions

Repeated mistakes are treated as a guardrail failure, not as a reminder problem.
