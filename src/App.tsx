import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  HelpCircle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import {
  analyzeMessage,
  DEFAULT_REQUIRED_FIELDS,
  FIELD_LABELS,
  MAX_MESSAGE_LENGTH,
  generateHandoff,
  type AnalysisResult,
  type FieldKey,
  type Finding,
  type HandoffFields
} from "./analysis";

type Example = {
  id: string;
  label: string;
  description: string;
  message: string;
  required: FieldKey[];
};

const EXAMPLES: Example[] = [
  {
    id: "vague",
    label: "Vague team assignment",
    description: "Missing owner and expected outcome",
    message: "Can someone finish the evaluation and send it over before the meeting?",
    required: ["owner", "deliverable", "deadline", "recipient"]
  },
  {
    id: "deadline",
    label: "Unclear deadline",
    description: "Relative timing needs a date",
    message: "Please prepare the status report soon and share it with the project team.",
    required: ["owner", "deliverable", "deadline", "recipient"]
  },
  {
    id: "deliverable",
    label: "Missing deliverable",
    description: "The action is present, the format is not",
    message: "Riya will handle the model evaluation by Friday.",
    required: ["owner", "deliverable", "deadline"]
  },
  {
    id: "sequence",
    label: "Multi-step task",
    description: "A prerequisite and sequence need clarity",
    message: "After the API is ready, update the dashboard and then send it to Arjun by Friday.",
    required: ["owner", "deliverable", "deadline", "recipient", "dependency"]
  },
  {
    id: "clear",
    label: "Well-specified handoff",
    description: "A clearer message should trigger fewer warnings",
    message: "Task: Publish the weekly test summary\nOwner: Riya Sharma\nRecipient: QA team in #release-testing\nDeliverable: A Markdown report with passed tests, failed tests, and blocker links\nDeadline: Friday at 4:00 PM IST\nDependency: None\nNext action: Run the regression suite and attach the report to the release issue.",
    required: ["owner", "deliverable", "deadline", "recipient"]
  }
];

const FIELD_ORDER: FieldKey[] = [
  "taskTitle",
  "owner",
  "recipient",
  "deliverable",
  "deadline",
  "dependency",
  "nextAction"
];

const FIELD_HINTS: Partial<Record<FieldKey, string>> = {
  taskTitle: "Use a short, descriptive title.",
  owner: "Only enter a person who has agreed to own the task.",
  recipient: "Name a person, team, channel, or destination.",
  deliverable: "Describe the actual artifact and how it will be judged complete.",
  deadline: "Prefer an exact date, time, and timezone.",
  dependency: "Enter a prerequisite, or write “None” if confirmed.",
  nextAction: "State the first action someone can take now."
};

function App() {
  const [message, setMessage] = useState("");
  const [requiredFields, setRequiredFields] = useState<FieldKey[]>(DEFAULT_REQUIRED_FIELDS);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fields, setFields] = useState<HandoffFields | null>(null);
  const [handoff, setHandoff] = useState("");
  const [draftNeedsRefresh, setDraftNeedsRefresh] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showChecks, setShowChecks] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (analysis) resultRef.current?.focus();
  }, [analysis]);

  const blockingError = message.trim().length === 0
    ? "Paste a task message or choose an example before checking it."
    : message.length > MAX_MESSAGE_LENGTH
      ? "Keep the message under " + MAX_MESSAGE_LENGTH.toLocaleString() + " characters."
      : "";

  function toggleRequired(field: FieldKey) {
    const hasExistingAnalysis = Boolean(analysis);
    setRequiredFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    );
    if (hasExistingAnalysis) {
      clearResults();
      setNotice("Required checks changed. Run the analysis again to update the findings.");
    }
  }

  function chooseExample(example: Example) {
    setMessage(example.message);
    setRequiredFields(example.required);
    setAnalysis(null);
    setFields(null);
    setHandoff("");
    setDraftNeedsRefresh(false);
    setError("");
    setNotice("Loaded example: " + example.label + ". Review the text, then check the handoff.");
    setCopied(false);
  }

  function clearResults() {
    setAnalysis(null);
    setFields(null);
    setHandoff("");
    setDraftNeedsRefresh(false);
    setNotice("");
    setError("");
    setCopied(false);
  }

  function runAnalysis() {
    setError("");
    setNotice("");
    setCopied(false);
    if (blockingError) {
      setError(blockingError);
      editorRef.current?.focus();
      return;
    }
    const result = analyzeMessage(message, { requiredFields });
    setAnalysis(result);
    setFields(result.fields);
    setHandoff(generateHandoff(result.fields, result.findings));
    setDraftNeedsRefresh(false);
    setNotice("Analysis complete. Review each suggestion and confirm details before sharing.");
  }

  function updateField(field: FieldKey, value: string) {
    setFields((current) => current ? { ...current, [field]: value } : current);
    setDraftNeedsRefresh(true);
    setCopied(false);
  }

  function refreshDraft() {
    if (!fields || !analysis) return;
    setHandoff(generateHandoff(fields, analysis.findings));
    setDraftNeedsRefresh(false);
    setNotice("Handoff draft updated. Bracketed fields still need confirmation.");
  }

  async function copyHandoff() {
    if (!handoff) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser context.");
      await navigator.clipboard.writeText(handoff);
      setCopied(true);
      setNotice("Handoff copied to clipboard.");
    } catch {
      setCopied(false);
      setNotice("Copy was blocked by the browser. Select the handoff text and copy it manually.");
    }
  }

  function downloadHandoff() {
    if (!handoff) return;
    const blob = new Blob([handoff], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "handofflint-handoff.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Text file download started.");
  }

  function resetAll() {
    setMessage("");
    setRequiredFields(DEFAULT_REQUIRED_FIELDS);
    clearResults();
    setNotice("Workspace reset. Your message was not saved by this app.");
    window.setTimeout(() => editorRef.current?.focus(), 0);
  }

  const highCount = analysis?.findings.filter((item) => item.severity === "high").length ?? 0;
  const ambiguousCount = analysis?.findings.filter((item) => item.kind === "ambiguous").length ?? 0;
  const missingCount = analysis?.findings.filter((item) => item.kind === "missing").length ?? 0;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to the handoff checker</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="HandoffLint home">
          <span className="brand-mark" aria-hidden="true"><ScanSearch size={21} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>HandoffLint</strong><span>Clarity before you commit</span></span>
        </a>
        <div className="topbar-right">
          <span className="privacy-pill"><ShieldCheck size={14} aria-hidden="true" /> LOCAL-FIRST</span>
          <a className="github-link" href="https://github.com/gourav-ai-engineer/Taskforge" target="_blank" rel="noreferrer">Open source <ArrowRight size={14} aria-hidden="true" /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> A SMALL CHECK FOR A BIGGER MISUNDERSTANDING</div>
            <h1 id="hero-title">Make the next<br /><span>step clear.</span></h1>
            <p className="hero-lede">Turn vague task messages into handoffs people can actually act on. Find the gaps, ask a better question, and keep the facts honest.</p>
            <a className="text-link" href="#workspace">Check a handoff <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
          <div className="hero-note" aria-label="How HandoffLint works">
            <div className="note-top"><span className="mini-icon"><Sparkles size={17} aria-hidden="true" /></span><span>THE CLARITY LOOP</span><span className="note-index">01 — 03</span></div>
            <div className="loop-step"><span className="loop-number">01</span><div><strong>Spot the gap</strong><p>Find missing or ambiguous details in the message.</p></div><CheckCircle2 size={17} className="loop-check" aria-hidden="true" /></div>
            <div className="loop-connector" aria-hidden="true" />
            <div className="loop-step"><span className="loop-number">02</span><div><strong>Confirm what matters</strong><p>Review evidence and fill only what you know.</p></div><CheckCircle2 size={17} className="loop-check" aria-hidden="true" /></div>
            <div className="loop-connector" aria-hidden="true" />
            <div className="loop-step"><span className="loop-number">03</span><div><strong>Send a clearer handoff</strong><p>Keep open questions visible, never guessed.</p></div><span className="loop-arrow"><ArrowRight size={15} aria-hidden="true" /></span></div>
            <div className="note-foot"><span className="foot-line" />No sign-in. No AI API. Your text stays in this browser.</div>
          </div>
        </section>

        <section className="workspace-section" id="workspace" aria-labelledby="workspace-title">
          <div className="section-heading">
            <div>
              <div className="section-kicker">THE HANDOFF CHECKER</div>
              <h2 id="workspace-title">Start with the message.</h2>
            </div>
            <p>Clear enough to act on? Check before the work changes hands.</p>
          </div>

          <div className="checker-layout">
            <section className="input-panel panel" aria-labelledby="message-label">
              <div className="panel-header">
                <div className="panel-title-wrap"><span className="panel-number">01</span><div><h3 id="message-label">Original message</h3><p>Paste the instruction exactly as you received it.</p></div></div>
                <span className="required-tag">REQUIRED</span>
              </div>

              <label className="sr-only" htmlFor="task-message">Task message to analyze</label>
              <textarea
                id="task-message"
                ref={editorRef}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setError("");
                  if (analysis) {
                    clearResults();
                    setNotice("Message changed. Run the check again to refresh the analysis.");
                  }
                }}
                maxLength={MAX_MESSAGE_LENGTH + 100}
                placeholder={"Can someone finish the evaluation and send it over before the meeting?"}
                rows={6}
                aria-describedby="message-help message-count"
                aria-invalid={Boolean(error || message.length > MAX_MESSAGE_LENGTH)}
              />
              <div className="input-meta"><span id="message-help">Private by design · Analyzed locally</span><span id="message-count" className={message.length > MAX_MESSAGE_LENGTH ? "count over" : "count"}>{message.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}</span></div>

              {error && <div className="inline-error" role="alert"><X size={16} aria-hidden="true" /><span>{error}</span></div>}

              <div className="examples-area">
                <div className="examples-heading"><span>TRY AN EXAMPLE</span><span>Choose a scenario</span></div>
                <div className="example-list">
                  {EXAMPLES.map((example, index) => (
                    <button className={"example-option" + (message === example.message ? " selected" : "")} type="button" key={example.id} onClick={() => chooseExample(example)}>
                      <span className="example-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="example-copy"><strong>{example.label}</strong><small>{example.description}</small></span>
                      <ArrowRight size={15} className="example-arrow" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="requirements-box">
                <button className="requirements-toggle" type="button" aria-expanded={showChecks} aria-controls="required-fields" onClick={() => setShowChecks(!showChecks)}>
                  <span><span className="checklist-icon"><Check size={14} aria-hidden="true" /></span><span><strong>What matters for this handoff?</strong><small>Choose details you need confirmed</small></span></span>
                  <ChevronDown size={17} className={showChecks ? "rotate" : ""} aria-hidden="true" />
                </button>
                {showChecks && <div className="requirement-options" id="required-fields">
                  {(["owner", "deliverable", "deadline", "recipient", "dependency"] as FieldKey[]).map((field) => (
                    <label key={field} className="check-option">
                      <input type="checkbox" checked={requiredFields.includes(field)} onChange={() => toggleRequired(field)} />
                      <span>{FIELD_LABELS[field]}</span>
                    </label>
                  ))}
                  <p>These checks set context, not universal rules. For example, a deadline is optional if this task has no time constraint.</p>
                </div>}
              </div>

              <button className="primary-button analyze-button" type="button" onClick={runAnalysis}>
                Check this handoff <ArrowRight size={17} aria-hidden="true" />
              </button>
              <p className="button-disclaimer">Rule-based suggestions, not a judgement of the person who wrote it.</p>
              {!analysis && notice && (
                <div className={"inline-notice" + (notice.startsWith("Copy was blocked") ? " notice-error" : "")}
                  role={notice.startsWith("Copy was blocked") ? "alert" : "status"} aria-live="polite">
                  <CheckCircle2 size={15} aria-hidden="true" /><span>{notice}</span>
                </div>
              )}
            </section>

            <aside className="sidebar">
              <section className="side-card why-card">
                <span className="side-icon"><HelpCircle size={18} aria-hidden="true" /></span>
                <h3>Why handoffs get fuzzy</h3>
                <p>“Finish it soon” can leave three people waiting—or three people doing the same work.</p>
                <div className="gap-list"><span><i>×</i> Unclear ownership</span><span><i>×</i> Invisible assumptions</span><span><i>×</i> A deadline without a time</span></div>
              </section>
              <section className="side-card fact-card">
                <span className="side-icon green"><ShieldCheck size={18} aria-hidden="true" /></span>
                <h3>Facts stay yours</h3>
                <p>The current checker runs in your browser. It does not send the message to an AI service or save it to an account.</p>
                <div className="local-badge"><span /> LOCAL ANALYSIS</div>
              </section>
              <div className="tiny-note"><span className="tiny-star">*</span><p>HandoffLint uses transparent text heuristics. It can miss context or raise a question that your team has already answered. You decide what is relevant.</p></div>
            </aside>
          </div>

          {analysis && fields && (
            <section className="results-section" ref={resultRef} tabIndex={-1} aria-labelledby="results-title">
              <div className="results-heading">
                <div><div className="section-kicker">THE REVIEW</div><h2 id="results-title">Here’s what could be clearer.</h2><p>Each finding includes the words that triggered it and a question you can ask.</p></div>
                <button className="ghost-button reset-button" type="button" onClick={resetAll}><RotateCcw size={15} aria-hidden="true" /> Start over</button>
              </div>

              <div className="summary-strip" aria-label="Analysis summary">
                <div className="summary-cell"><span className="summary-value">{analysis.findings.filter((item) => item.kind !== "info" && item.id !== "looks-clear").length}</span><span className="summary-label">Questions to review</span></div>
                <div className="summary-cell"><span className="summary-value">{missingCount}</span><span className="summary-label">Missing details</span></div>
                <div className="summary-cell"><span className="summary-value">{ambiguousCount}</span><span className="summary-label">Potential ambiguity</span></div>
                <div className="summary-state"><span className={highCount ? "state-dot warn" : "state-dot clear"} />{highCount ? "Review before sending" : "No high-severity gaps found"}</div>
              </div>

              <div className="review-grid">
                <div className="findings-column">
                  <div className="subsection-header"><h3>Signals to review</h3><span>{analysis.findings.length} {analysis.findings.length === 1 ? "finding" : "findings"}</span></div>
                  <div className="finding-list">
                    {analysis.findings.map((finding) => <FindingCard finding={finding} key={finding.id} />)}
                  </div>
                  <div className="extracted-card">
                    <div className="extracted-title"><FileText size={17} aria-hidden="true" /><div><strong>Explicit details found</strong><small>Only facts the rules could identify in the message.</small></div></div>
                    {analysis.explicitFacts.length ? <ul>{analysis.explicitFacts.map((fact) => <li key={fact.field}><strong>{FIELD_LABELS[fact.field]}:</strong> {fact.value}<small className="fact-evidence">Evidence: “{fact.evidence}”</small></li>)}</ul> : <p>No structured facts were confidently identified. Fill in the fields on the right only with information you can confirm.</p>}
                  </div>
                </div>

                <div className="fields-column">
                  <div className="subsection-header"><h3>Confirm the details</h3><span>EDITABLE</span></div>
                  <p className="column-intro">Review extracted values and add confirmed details. Leave unknowns blank.</p>
                  <div className="fields-card">
                    {FIELD_ORDER.map((field) => (
                      <div className="field-row" key={field}>
                        <label htmlFor={"field-" + field}>{FIELD_LABELS[field]}{requiredFields.includes(field) && <span className="field-required" aria-label="required for this check"> *</span>}</label>
                        <input id={"field-" + field} value={fields[field]} onChange={(event) => updateField(field, event.target.value)} placeholder={"Confirm " + FIELD_LABELS[field].toLowerCase()} aria-describedby={"hint-" + field} />
                        <small id={"hint-" + field}>{FIELD_HINTS[field]}</small>
                      </div>
                    ))}
                    <p className="field-footnote"><span>*</span> Required in this review, not necessarily for every task. Only enter details that have been confirmed.</p>
                  </div>
                </div>
              </div>

              <section className="handoff-section" aria-labelledby="handoff-title">
                <div className="handoff-heading">
                  <div><div className="section-kicker">THE HANDOFF</div><h3 id="handoff-title">A draft you can stand behind.</h3><p>Bracketed items are unknown or need confirmation. Edit before sending.</p></div>
                  <div className="handoff-actions">
                    <button type="button" className="ghost-button" onClick={refreshDraft}><RotateCcw size={14} aria-hidden="true" /> {draftNeedsRefresh ? "Update draft" : "Regenerate"}</button>
                    <button type="button" className="ghost-button" onClick={downloadHandoff}><Download size={15} aria-hidden="true" /> Download .txt</button>
                    <button type="button" className="primary-button copy-button" onClick={copyHandoff}><Clipboard size={15} aria-hidden="true" /> {copied ? "Copied" : "Copy handoff"}</button>
                  </div>
                </div>
                {analysis && notice && (
                  <div className={"inline-notice" + (notice.startsWith("Copy was blocked") ? " notice-error" : "")}
                    role={notice.startsWith("Copy was blocked") ? "alert" : "status"} aria-live="polite">
                    <CheckCircle2 size={15} aria-hidden="true" /><span>{notice}</span>
                  </div>
                )}
                {draftNeedsRefresh && <div className="draft-warning" role="status">You changed a field. Update the draft to include your latest details. If you also edited the draft text, regenerating will replace those manual edits.</div>}
                <label className="sr-only" htmlFor="handoff-output">Editable handoff draft</label>
                <textarea id="handoff-output" className="handoff-editor" value={handoff} onChange={(event) => { setHandoff(event.target.value); setDraftNeedsRefresh(false); setCopied(false); }} rows={13} />
                <div className="handoff-foot"><span><ShieldCheck size={14} aria-hidden="true" /> Unconfirmed details stay visible.</span><span>You remain the final editor.</span></div>
              </section>
            </section>
          )}
        </section>

        <section className="bottom-banner" aria-label="Product principle">
          <div className="banner-mark" aria-hidden="true">“</div>
          <div><p>Clarity is a kindness you can build into the workflow.</p><span>HandoffLint · Make the next step clear.</span></div>
          <a href="#workspace">Check a message <ArrowRight size={16} aria-hidden="true" /></a>
        </section>
      </main>

      <footer className="footer">
        <a className="footer-brand" href="#top">HandoffLint<span> / Taskforge</span></a>
        <span>Made for clearer work, by design.</span>
        <a href="https://github.com/gourav-ai-engineer/Taskforge" target="_blank" rel="noreferrer">Source code <ArrowRight size={13} aria-hidden="true" /></a>
      </footer>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const kindLabel = finding.kind === "info" ? "INFO" : finding.kind === "missing" ? "MISSING" : finding.kind === "ambiguous" ? "AMBIGUOUS" : "POSSIBLE CONFLICT";
  return (
    <article className={"finding-card severity-" + finding.severity}>
      <div className="finding-topline"><span className={"kind-label kind-" + finding.kind}>{kindLabel}</span><span className="severity-label">{finding.severity === "high" ? "Review first" : finding.severity === "medium" ? "Worth clarifying" : "Context check"}</span></div>
      <h4>{finding.title}</h4>
      {finding.excerpt && <blockquote><span aria-hidden="true">“</span>{finding.excerpt}<span aria-hidden="true">”</span></blockquote>}
      <p className="finding-why">{finding.why}</p>
      <div className="question-box"><span className="question-mark"><HelpCircle size={15} aria-hidden="true" /></span><div><span>QUESTION TO ASK</span><p>{finding.question}</p></div></div>
    </article>
  );
}

export default App;
