# HandoffLint
### Make the next step clear.

HandoffLint is an accessibility-first handoff clarity assistant for students, project teams, and people coordinating work. It checks a task message for missing or ambiguous details, explains what may need clarification, and helps produce an editable, actionable handoff.

> A better handoff is not a longer message. It is a message with fewer unanswered questions.

## Why this project
Messages like “Can someone finish the evaluation and send it over before the meeting?” can hide important gaps: who owns the task, what output is expected, who should receive it, and what “before the meeting” means. HandoffLint surfaces those questions instead of silently guessing.

## Features
- Analyze pasted task messages with deterministic, explainable rules.
- Inspect explicit facts and edit structured handoff fields.
- Flag missing ownership, unclear deliverables, vague requests, relative deadlines, ambiguous references, dependencies, multiple actions, and potentially conflicting timing.
- Choose which fields are required for a particular handoff.
- Use five editable demo scenarios, including a well-specified message.
- Generate, edit, copy, and download a handoff draft.
- Keyboard-friendly controls, visible focus, live status announcements, responsive layout, and reduced-motion support.
- No sign-in, no backend, no API key, and no third-party AI calls in the current version.

## How it works
1. Paste a message or load an example.
2. Choose the details that matter for this handoff.
3. Run the local rule-based analysis.
4. Review findings and edit the structured fields.
5. Generate and personalize a handoff; unresolved details remain explicit placeholders.

The analyzer uses heuristics, not a language model. Findings are suggestions for clarification, not a validated measure of communication quality. A rule may miss nuance or flag a phrase that makes sense in context.

## Tech stack
- React + TypeScript
- Vite
- CSS with responsive and accessibility-oriented styling
- Vitest for analysis-engine tests
- GitHub Actions for CI

## Run locally
Prerequisites: Node.js 20.19+ (or 22.12+) and a current npm release.

    npm install
    npm run dev

Vite prints the local development URL, usually http://localhost:5173.

## Quality checks

    npm test
    npm run typecheck
    npm run build

## Production preview

    npm run build
    npm run preview

The production bundle is written to dist/. The built frontend can be hosted on static hosting such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages. Configure the host to use npm run build and dist as the output directory. A public deployment has not been configured by this repository commit.

## Privacy and security
The current application analyzes text in the browser. It does not send the message to a server, call an external AI provider, require an account, or save message content to persistent storage. Clipboard copying and file downloads only happen when the user requests them. Browser extensions and the hosting provider remain outside the application's control.

Do not paste secrets or sensitive personal information into public demo sessions. If a future version adds a third-party model, it must disclose what is sent, keep credentials server-side, validate returned data, and retain deterministic fallback behavior.

## Accessibility
Semantic elements, visible focus, labeled inputs, status announcements, text-based severity labels, responsive layouts, and reduced-motion support are included. WCAG 2.2 AA is a design target, not a certified conformance claim. Test with keyboard navigation, a screen reader, contrast tools, and real devices before making formal accessibility claims.

## Demo scenarios
- Vague team assignment
- Relative deadline
- Missing deliverable
- Multi-step task with a dependency
- Well-specified handoff

## Limitations
- Rule-based extraction cannot fully understand every sentence or resolve context outside the pasted message.
- Date and conflict detection is intentionally conservative and may require human review.
- There is no authentication, cloud sync, collaboration, backend, database, or LLM integration in this MVP.
- The application cannot determine whether a proposed deadline or task requirement is appropriate; people remain responsible for confirming facts.

## AI assistance and third-party components
This implementation uses no external AI inference API. It uses open-source frontend and test dependencies listed in package.json. Disclose coding-assistant usage and any additional components according to the current hackathon rules. Do not claim that AI analysis is implemented in this version.

## 60-second demo script
“Task messages often sound clear until someone has to act on them. HandoffLint lets me paste a real instruction, choose what matters, and find missing ownership, a vague deliverable, or an uncertain deadline. It quotes the original wording so I can see why each prompt appeared. I can then edit the fields, answer what I know, and generate a handoff. Anything nobody confirmed stays visibly marked for confirmation. The current version runs in the browser without an account or external AI calls, so the original message stays local.”

## Two-minute demo-video outline
1. Introduce the ambiguity problem with the vague assignment example.
2. Analyze it and inspect the findings and the source phrases.
3. Edit owner, deliverable, and deadline fields with confirmed values.
4. Generate a handoff and show the unresolved placeholders that remain.
5. Copy or download the draft.
6. Load the well-specified scenario to demonstrate that not every message receives the same warnings.
7. Close with the local-first privacy model and heuristic limitations.

## Project status
The repository contains the application source and automated tests. Run the quality-check commands above in your environment and inspect the CI result before treating a release or submission as verified.
