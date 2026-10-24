# Taskforge 2026 — Devpost submission draft

> Replace the bracketed placeholders and verify every statement before submitting. This is a draft, not a completed Devpost submission.

## Project name

**HandoffLint**

## Tagline

**Make the next step clear.**

## One-sentence summary

HandoffLint helps teams catch missing or ambiguous details in task instructions, ask better clarification questions, and produce an editable handoff without silently inventing facts.

## Problem

Team messages often sound clear to the person writing them but leave the recipient guessing: Who owns the task? What should be delivered? When is it due? What must happen first? Which document does “it” refer to?

These gaps can lead to delays, duplicated effort, or avoidable back-and-forth. Generic rewriting can make a message sound smoother without making the requirements any more certain.

## Intended users

Students, hackathon teams, project groups, and people coordinating work asynchronously who need task instructions to be clear before work changes hands.

## Solution

HandoffLint analyzes a pasted message with transparent local rules. It flags potential gaps and ambiguity, shows the source wording that triggered each finding, and presents clarification questions. Users can edit the structured handoff fields, review which details remain unresolved, and generate, edit, copy, or download a clearer handoff draft.

The application preserves manually edited field values if the source message changes and visibly asks the user to review retained values. It also asks before regenerating a draft that has been manually edited.

**The guiding principle is simple: unknown facts stay unknown until the user confirms them.**

## What makes it different

HandoffLint focuses on *handoff ambiguity* rather than task management or generic message rewriting. It aims to make uncertainty visible, connect a finding to its supporting words, route users directly to the associated field, and keep unanswered questions in the final draft.

This is a product distinction, not a claim that no comparable tool exists.

## How it works

1. Paste a task instruction or load a sample scenario.
2. Choose the fields that matter for this handoff.
3. Run the local rule-based checks.
4. Review findings and source evidence.
5. Edit or confirm details and inspect unresolved questions.
6. Generate, edit, copy, or download the handoff.

## Technology

- React
- TypeScript
- Vite
- CSS
- Vitest
- ESLint
- GitHub Actions

Source repository: https://github.com/gourav-ai-engineer/Taskforge

## Technical implementation

The analyzer uses deterministic, explainable heuristics rather than external AI inference. It checks for missing owners and deliverables, vague language, relative deadlines, ambiguous references, dependencies, multiple actions, and potentially conflicting timing. The interface uses editable structured fields, evidence excerpts, field-to-finding navigation, visible status messaging, and protected manual handoff edits.

The analysis engine has 58 unit tests. Lint, TypeScript typecheck, the unit tests, dependency audit, and production build run in GitHub Actions on every push to main: https://github.com/gourav-ai-engineer/Taskforge/actions.

## Accessibility and privacy

The interface includes semantic elements, labeled controls, visible keyboard focus, live status messaging, responsive layouts, and reduced-motion support. Accessibility checks with a screen reader, keyboard-only use, and contrast tools still need to be completed before claiming full WCAG conformance.

Pasted message analysis runs in the browser without an external AI API or account, and the current application does not persist message content. The interface no longer requests Google Fonts from a remote server.

## Limitations and what we learned

The analyzer uses heuristic rules. It can miss context, flag an instruction that makes sense to the people involved, or fail to recognize a phrasing pattern. A flagged issue is a suggestion for review, not proof that a message is wrong. Users remain responsible for confirming the owner, deadline, deliverable, and dependencies.

The work reinforced an important design principle: a tool that helps clarify instructions should not create new uncertainty by inventing details. Preserving user edits and showing unresolved questions are therefore core product behaviors, not afterthoughts.

## Demo video / walkthrough

**Video URL:** [ADD THE ACTUAL DEMO VIDEO LINK BEFORE SUBMISSION]

Recommended 60–90 second walkthrough:
1. Load “Vague team assignment.”
2. Show the finding and highlighted source wording.
3. Enter a confirmed value in its related field and show the corresponding finding/status change.
4. Change the original message and show preserved values marked for review.
5. Edit the output manually and demonstrate the replacement confirmation.
6. Load “Well-specified handoff” and show a different analysis outcome.
7. Finish with the privacy model and heuristic limitations.

## Live demo

**URL:** [ADD A VERIFIED PUBLIC URL ONLY AFTER IT OPENS IN A FRESH/INCOGNITO BROWSER]

A Vercel deployment was created for the latest verified implementation commit, and Vercel's deployment list reports state READY. Public accessibility and live behavior could not be verified because the connected integration receives a permission error when inspecting/fetching the deployment. Do not treat the returned URL as a confirmed public demo until it opens in a fresh/incognito browser and the core interactions work.

## Team members

[LIST ALL TEAM MEMBERS EXACTLY AS REQUIRED BY DEVPOST, WITH THEIR ACTUAL ROLES.]

## AI assistance and pre-existing work disclosure

ChatGPT was used for coding assistance, code review, test development, and documentation. The application’s current analysis engine is deterministic and does not send pasted messages to an external model API. Review the repository history and disclose any pre-existing work or third-party components as required by the official event rules. Team members remain responsible for understanding, validating, and explaining the code they submit.

## Submission checklist

- [ ] Confirm eligibility and the official deadline/timezone.
- [ ] Fill in all team member names and roles.
- [ ] Replace the demo-video placeholder with the actual video link.
- [ ] Add a live URL only after it is publicly accessible and tested.
- [ ] Explain any pre-existing work and coding-assistant usage honestly.
- [ ] Test desktop and mobile flow, keyboard-only use, and screen-reader feedback.
- [ ] Verify source repository visibility and setup instructions.
- [ ] Submit the complete Devpost project page before the deadline.
