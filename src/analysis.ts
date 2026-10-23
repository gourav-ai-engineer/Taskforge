export type FieldKey =
  | "taskTitle"
  | "owner"
  | "recipient"
  | "deliverable"
  | "deadline"
  | "dependency"
  | "nextAction";

export type FindingKind = "missing" | "ambiguous" | "conflicting" | "info";
export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  field: FieldKey;
  title: string;
  excerpt: string;
  why: string;
  question: string;
}

export type HandoffFields = Record<FieldKey, string>;

export interface AnalysisOptions {
  requiredFields: FieldKey[];
}

export interface ExplicitFact {
  field: FieldKey;
  value: string;
  evidence: string;
}

export interface AnalysisResult {
  originalMessage: string;
  fields: HandoffFields;
  findings: Finding[];
  explicitFacts: ExplicitFact[];
  characterCount: number;
}

export const MAX_MESSAGE_LENGTH = 3000;

export const FIELD_LABELS: Record<FieldKey, string> = {
  taskTitle: "Task title",
  owner: "Owner",
  recipient: "Recipient",
  deliverable: "Deliverable / expected outcome",
  deadline: "Deadline",
  dependency: "Dependency / prerequisite",
  nextAction: "Immediate next step"
};

export const DEFAULT_REQUIRED_FIELDS: FieldKey[] = [
  "owner",
  "deliverable",
  "deadline"
];

const EMPTY_FIELDS = (): HandoffFields => ({
  taskTitle: "",
  owner: "",
  recipient: "",
  deliverable: "",
  deadline: "",
  dependency: "",
  nextAction: ""
});

/**
 * Keep values that the user edited even when the source message is analyzed again.
 * An empty string is also a meaningful edit: it prevents an old inferred value
 * from silently reappearing after the user deliberately cleared the field.
 */
export function applyManualFieldEdits(
  extracted: HandoffFields,
  manualEdits: Partial<HandoffFields>
): HandoffFields {
  return { ...extracted, ...manualEdits };
}

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

function capture(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1]
        .replace(/,\s*(?:not|rather than|instead of)\b[\s\S]*$/i, "")
        .replace(/[.!?]+$/, "");
      return normalizeWhitespace(cleaned);
    }
  }
  return "";
}

function sentenceExcerpt(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return "";
  const start = text.lastIndexOf(".", match.index);
  const newline = text.lastIndexOf("\n", match.index);
  const begin = Math.max(start, newline) + 1;
  const endCandidates = [
    text.indexOf(".", match.index),
    text.indexOf("\n", match.index),
    text.indexOf("?", match.index),
    text.indexOf("!", match.index)
  ].filter((value) => value >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length;
  return normalizeWhitespace(text.slice(begin, end)).slice(0, 180);
}

function addFinding(
  findings: Finding[],
  finding: Omit<Finding, "id">,
  id: string
): void {
  if (findings.some((item) => item.id === id)) return;
  findings.push({ ...finding, id });
}


const LABEL_PATTERNS: Record<FieldKey, RegExp> = {
  taskTitle: /\b(?:task|title)\s*:/i,
  owner: /\b(?:owner|assignee|assigned to)\s*:/i,
  recipient: /\brecipient\s*:/i,
  deliverable: /\b(?:deliverable|expected output|output|format)\s*:/i,
  deadline: /\b(?:deadline|due date|due)\s*:/i,
  dependency: /\b(?:prerequisite|dependency)\s*:/i,
  nextAction: /\b(?:next action|next step)\s*:/i
};

function sourceEvidence(originalMessage: string, field: FieldKey, value: string): string {
  const valueLower = value.toLowerCase();
  const lines = originalMessage.split(/\r?\n/);
  const labeledLine = lines.find((line) =>
    LABEL_PATTERNS[field].test(line) && line.toLowerCase().includes(valueLower)
  );
  if (labeledLine) return normalizeWhitespace(labeledLine).slice(0, 180);

  if (field === "dependency") {
    const dependencyPatterns = [
      /\b(?:after|once|when)\s+[^,.;!?]+/i,
      /\b(?:depends on|blocked by|waiting for)\s+[^,.;!?]+/i,
      /\b(?:no dependencies|no dependency|no prerequisites|no prerequisite|does not depend on anything)\b/i
    ];
    const clause = dependencyPatterns
      .map((pattern) => originalMessage.match(pattern)?.[0] ?? "")
      .find((match) => match.toLowerCase().includes(valueLower));
    if (clause) return normalizeWhitespace(clause).slice(0, 180);
  }

  if (field === "recipient") {
    const recipientClause = originalMessage.match(
      /\b(?:send|share|deliver)\b[^.!?\n]{0,60}\bto\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})/i
    );
    if (recipientClause?.[0] && recipientClause[1].toLowerCase() === valueLower) {
      return normalizeWhitespace(recipientClause[0]).slice(0, 100);
    }
  }

  if (field === "deadline") {
    const deadlineClause = originalMessage.match(
      /\b(?:by|before|due|deadline(?:\s+is)?)\s+(?:Friday|Monday|Tuesday|Wednesday|Thursday|Saturday|Sunday|tomorrow|tonight|today|next week|end of day|EOD|\d{4}-\d{2}-\d{2})(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)(?:\s+[A-Z]{2,5})?)?/i
    );
    if (deadlineClause?.[0] && deadlineClause[0].toLowerCase().includes(valueLower)) {
      return normalizeWhitespace(deadlineClause[0]).slice(0, 100);
    }
  }

  const valueIndex = originalMessage.toLowerCase().indexOf(valueLower);
  if (valueIndex < 0) return value;
  const start = Math.max(0, valueIndex - 38);
  const end = Math.min(originalMessage.length, valueIndex + value.length + 38);
  const snippet = normalizeWhitespace(originalMessage.slice(start, end));
  return (start > 0 ? "…" : "") + snippet + (end < originalMessage.length ? "…" : "");
}

function hasSpecificDeadline(value: string): boolean {
  return /\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?\b/i.test(value);
}

export function isFindingAddressed(
  finding: Finding,
  manualEdits: Partial<HandoffFields>,
  fieldsToReview: FieldKey[] = []
): boolean {
  if (fieldsToReview.includes(finding.field)) return false;
  const value = manualEdits[finding.field]?.trim() ?? "";
  if (!value) return false;
  if (finding.id === "relative-deadline") return hasSpecificDeadline(value);
  return true;
}

export function getUnresolvedFindings(
  findings: Finding[],
  manualEdits: Partial<HandoffFields> = {},
  fieldsToReview: FieldKey[] = []
): Finding[] {
  return findings.filter((finding) =>
    finding.kind !== "info" &&
    finding.id !== "looks-clear" &&
    !isFindingAddressed(finding, manualEdits, fieldsToReview)
  );
}

function findFacts(text: string): HandoffFields {
  const fields = EMPTY_FIELDS();

  fields.taskTitle = capture(text, [
    /\btask\s*:\s*([^\n.!?]+)/i,
    /\btitle\s*:\s*([^\n.!?]+)/i
  ]);

  fields.owner = capture(text, [
    /\b(?:owner|assignee|assigned to)\s*:\s*([^\n.;]+)/i,
    /\b(?:owner|assignee|assigned to)\s+(?:is\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})\b/
  ]);

  fields.recipient = capture(text, [
    /\b(?:recipient|send to|deliver to|share with)\s*:\s*([^\n.;]+)/i,
    /\b(?:send|share|deliver)\b[^.!?\n]{0,60}\bto\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})\b/
  ]);

  fields.deliverable = capture(text, [
    /\b(?:deliverable|expected output|output|format)\s*:\s*([^\n.!?]+)/i,
    /\b(?:prepare|create|produce|submit|deliver|write)\s+(?:a|an|the)?\s*((?:evaluation|status|research|design|test|weekly|final|project)?\s*(?:report|document|presentation|slides|spreadsheet|csv|notebook|prototype|demo|pull request|pr|summary|analysis))\b/i
  ]);

  fields.deadline = capture(text, [
    /\b(?:deadline|due date|due)\s*(?::|is)?\s*([^\n.!?]+)/i,
    /\bby\s+((?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+\w+)?|tomorrow|tonight|today|next week|end of day|EOD|the meeting|Friday|Monday)[^\n.!?]*)/i
  ]);

  fields.dependency = capture(text, [
    /\b(?:prerequisite|dependency)\s*:\s*([^\n.!?]+)/i,
    /\b(?:depends on|blocked by|waiting for)\s+([^,.!?]+)/i,
    /\b(?:after|once|when)\s+([^,.!?]+?)(?=[,;]|$)/i
  ]);

  const explicitNoDependency = /\b(?:no dependencies|no dependency|no prerequisites|no prerequisite|does not depend on anything)\b/i.exec(text);
  if (explicitNoDependency) fields.dependency = normalizeWhitespace(explicitNoDependency[0]);

  fields.nextAction = capture(text, [
    /\bnext action\s*:\s*([^\n.!?]+)/i,
    /\bnext step\s*:\s*([^\n.!?]+)/i,
    /\b(?:first|initially|start by)\s+([^\n.!?]+)/i,
    /(?:^|\n)\s*(?:please\s+)?(?:can you|could you|can someone|can somebody|could someone)\s+((?:finish|complete|prepare|create|review|fix|test|build|send|share|submit|publish|run|analy[sz]e|write|deliver|update|check|confirm|provide|verify|deploy|schedule|contact|coordinate|document|design|evaluate|open|close|compare|extract|summari[sz]e|measure|approve|install|execute|export)\b[^\n.!?]*)/i,
    /(?:^|\n)\s*(?:please\s+)?((?:finish|complete|prepare|create|review|fix|test|build|send|share|submit|publish|run|analy[sz]e|write|deliver|update|check|confirm|provide|verify|deploy|schedule|contact|coordinate|document|design|evaluate|open|close|compare|extract|summari[sz]e|measure|approve|install|execute|export)\b[^\n.!?]*)/i,
    /\b(?:you should|you must|you need to|need to|should|must)\s+((?:finish|complete|prepare|create|review|fix|test|build|send|share|submit|publish|run|analy[sz]e|write|deliver|update|check|confirm|provide|verify|deploy|schedule|contact|coordinate|document|design|evaluate|open|close|compare|extract|summari[sz]e|measure|approve|install|execute|export)\b[^\n.!?]*)/i
  ]);

  return fields;
}

export function analyzeMessage(
  input: string,
  options: AnalysisOptions = { requiredFields: DEFAULT_REQUIRED_FIELDS }
): AnalysisResult {
  const originalMessage = input.trim();
  const text = normalizeWhitespace(originalMessage);
  const findings: Finding[] = [];
  const required = new Set(options.requiredFields);

  if (input.length > MAX_MESSAGE_LENGTH) {
    const tooLong: Finding = {
      id: "message-too-long",
      kind: "missing",
      severity: "high",
      field: "taskTitle",
      title: "Message exceeds the supported length",
      excerpt: text.slice(0, 180),
      why: "Long messages are harder to review reliably with the local rule checks.",
      question: "Can you shorten the message to " + MAX_MESSAGE_LENGTH.toLocaleString() + " characters or fewer?"
    };
    return {
      originalMessage,
      fields: EMPTY_FIELDS(),
      findings: [tooLong],
      explicitFacts: [],
      characterCount: input.length
    };
  }

  const fields = findFacts(originalMessage);
  if (!text) {
    addFinding(findings, {
      kind: "missing",
      severity: "high",
      field: "taskTitle",
      title: "Add a task message",
      excerpt: "",
      why: "There is no message to analyze yet.",
      question: "What instruction or task message should be clarified?"
    }, "empty-message");
    return { originalMessage, fields, findings, explicitFacts: [], characterCount: input.length };
  }

  if (required.has("owner") && !fields.owner) {
    addFinding(findings, {
      kind: "missing",
      severity: "high",
      field: "owner",
      title: "Task owner is not explicit",
      excerpt: sentenceExcerpt(originalMessage, /\b(?:someone|anyone|we|you|they|can somebody|can someone)\b/i) || text.slice(0, 180),
      why: "A request can be seen by several people without making it clear who is responsible for completion.",
      question: "Who is the person responsible for completing this task?"
    }, "missing-owner");
  }

  const vaguePattern = /\b(?:handle this|take care of it|finish it|do the needful|send it over|sort this out|work on it|as appropriate|when possible)\b/i;
  const vagueMatch = vaguePattern.exec(originalMessage);
  if (vagueMatch) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "medium",
      field: "deliverable",
      title: "Vague action needs a concrete outcome",
      excerpt: sentenceExcerpt(originalMessage, vaguePattern) || vagueMatch[0],
      why: "The wording does not define what a successful result should look like.",
      question: "What specific result or artifact should be produced?"
    }, "vague-action");
  }

  if (required.has("deliverable") && !fields.deliverable) {
    addFinding(findings, {
      kind: "missing",
      severity: "medium",
      field: "deliverable",
      title: "Expected output is not specified",
      excerpt: sentenceExcerpt(originalMessage, /\b(?:finish|complete|do|work on|review|evaluate|check|prepare|send)\b/i) || text.slice(0, 180),
      why: "The action may be understood, but the expected format or completion criteria are not explicit.",
      question: "What exact output should be delivered, and in what format?"
    }, "missing-deliverable");
  }

  const explicitNoDeadline = /\b(?:no deadline(?: is)? (?:needed|required|necessary)|deadline (?:is )?(?:not needed|required|necessary)|without a deadline|no specific deadline)\b/i.exec(text);
  if (explicitNoDeadline) fields.deadline = normalizeWhitespace(explicitNoDeadline[0]);

  const deadlineSignal = /\b(?:asap|soon|shortly|later|before the meeting|by the meeting|end of day|eod|tomorrow|tonight|today|next week|next month|by friday|by monday|by tuesday|by wednesday|by thursday|by saturday|by sunday|\d{4}-\d{2}-\d{2})\b/i;
  const hasDeadline = Boolean(fields.deadline) || deadlineSignal.test(text);
  const relativeDeadline = /\b(?:asap|soon|shortly|later|before the meeting|by the meeting|end of day|eod|tomorrow|tonight|today|next week|next month|by friday|by monday|by tuesday|by wednesday|by thursday|by saturday|by sunday)\b/i;
  const relativeDeadlineSentence = sentenceExcerpt(originalMessage, relativeDeadline);
  const relativeDeadlineExcerpt = relativeDeadline.exec(originalMessage)?.[0] ?? relativeDeadlineSentence;
  const hasSpecificDeadlineTime = hasSpecificDeadline(relativeDeadlineSentence);
  if (required.has("deadline") && !hasDeadline) {
    addFinding(findings, {
      kind: "missing",
      severity: "medium",
      field: "deadline",
      title: "No deadline is stated",
      excerpt: text.slice(0, 180),
      why: "Without a requested time, the recipient may not know when the work is needed.",
      question: "Is there a deadline? If so, what exact date and time should be used?"
    }, "missing-deadline");
  } else if (required.has("deadline") && relativeDeadline.test(text) && !hasSpecificDeadlineTime) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "medium",
      field: "deadline",
      title: "Timing may be relative or unclear",
      excerpt: relativeDeadlineExcerpt || text.slice(0, 180),
      why: "A relative phrase or weekday without a specific date or time can depend on context. Confirm the intended deadline before sending.",
      question: "What exact date and time does this deadline refer to?"
    }, "relative-deadline");
  }

  if (required.has("recipient") && !fields.recipient && /\b(?:send|share|deliver|submit|forward|email)\b/i.test(text)) {
    addFinding(findings, {
      kind: "missing",
      severity: "low",
      field: "recipient",
      title: "Recipient or destination may be missing",
      excerpt: sentenceExcerpt(originalMessage, /\b(?:send|share|deliver|submit|forward|email)\b/i) || text.slice(0, 180),
      why: "An action that sends or submits something may need a named person, channel, or location.",
      question: "Who should receive the output, or where should it be submitted?"
    }, "missing-recipient");
  }

  const actionableReference = /\b(?:finish|complete|review|fix|update|change|submit|do|send|share|deliver|publish|replace|move|delete|attach)\s+(?:it|them)\b|\b(?:finish|complete|review|fix|update|change|submit|do|send|share|deliver|publish|replace|move|delete|attach)\s+(?:this|that|these|those)\b(?=\s*(?:[,.!?;:]|$)|\s+(?:over|to|by|before|after|when|once|today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|now|again|in|out|there|later|first|next|too)\b)/i;
  if (actionableReference.test(text)) {
    const pronounExcerpt = sentenceExcerpt(originalMessage, actionableReference);
    addFinding(findings, {
      kind: "ambiguous",
      severity: "low",
      field: "deliverable",
      title: "A reference may depend on shared context",
      excerpt: pronounExcerpt || text.slice(0, 180),
      why: "A person who did not see the earlier conversation may not know what the reference points to.",
      question: "Which exact document, task, or item does this reference mean?"
    }, "ambiguous-reference");
  }

  const dependencyWords = /\b(?:depends on|blocked by|waiting for|once .{2,60} is|after .{2,60} is)\b/i;
  if (dependencyWords.test(text) && !fields.dependency) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "medium",
      field: "dependency",
      title: "A prerequisite may need naming",
      excerpt: sentenceExcerpt(originalMessage, dependencyWords) || text.slice(0, 180),
      why: "The message suggests an ordering or blocker, but the prerequisite may not be clear enough to act on.",
      question: "What must happen first, and who is responsible for that prerequisite?"
    }, "unclear-dependency");
  } else if (required.has("dependency") && !fields.dependency) {
    addFinding(findings, {
      kind: "missing",
      severity: "low",
      field: "dependency",
      title: "Check whether there is a prerequisite",
      excerpt: text.slice(0, 180),
      why: "A dependency is not stated. This is only a check; many tasks have no dependency.",
      question: "Does this task depend on another task, approval, or input?"
    }, "missing-dependency");
  }

  const pairedActions = /\b(?:finish|complete|prepare|create|update|review|fix|test|build|send|share|submit|publish|run|analyze|analyse|write|deliver)\b[^.!?]{0,100}\band\b[^.!?]{0,70}\b(?:finish|complete|prepare|create|update|review|fix|test|build|send|share|submit|publish|run|analyze|analyse|write|deliver)\b/i;
  const hasSequenceCue = /\b(?:and then|then|after that|before that|first|finally|next)\b/i.test(text);
  if (pairedActions.test(text) && !hasSequenceCue) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "medium",
      field: "nextAction",
      title: "Several actions may need an explicit order",
      excerpt: sentenceExcerpt(originalMessage, pairedActions) || text.slice(0, 180),
      why: "The message combines multiple action verbs without saying whether one must finish before the next begins.",
      question: "Should these actions happen in a particular order, and what marks completion of each one?"
    }, "multiple-actions-no-sequence");
  }

  const timingMentions = text.match(/\b(?:today|tomorrow|tonight|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|next week|next month|ASAP|soon|EOD|end of day|\d{4}-\d{2}-\d{2})\b/gi) || [];
  const uniqueTimingMentions = [...new Set(timingMentions.map((value) => value.toLowerCase()))];
  const explicitTimingCorrection = /\b(?:not\s+(?:by\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tomorrow)|rather than\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|instead of\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:deadline|due date|timing)\b[^.!?]{0,45}\b(?:corrected|updated|changed|rescheduled))\b/i.test(text)
    || /\b(?:corrected|updated|changed|rescheduled)\b[^.!?]{0,55}\bfrom\b[^.!?]{0,35}\bto\b/i.test(text);
  if (uniqueTimingMentions.length >= 2 && /\b(?:by|before|after|due|deadline)\b/i.test(text) && !explicitTimingCorrection) {
    addFinding(findings, {
      kind: "conflicting",
      severity: "high",
      field: "deadline",
      title: "More than one timing reference appears",
      excerpt: text.slice(0, 180),
      why: "The message includes multiple timing expressions. They may be consistent, but should be confirmed before assigning a deadline.",
      question: "Which timing requirement is authoritative? Please confirm the exact date and time."
    }, "multiple-timing-references");
    fields.deadline = "";
  }

  if (required.has("nextAction") && !fields.nextAction) {
    addFinding(findings, {
      kind: "missing",
      severity: "medium",
      field: "nextAction",
      title: "No clear next action was identified",
      excerpt: text.slice(0, 180),
      why: "It may help to state the first observable action someone should take.",
      question: "What is the immediate next action?"
    }, "missing-next-action");
  }

  if (!findings.length) {
    addFinding(findings, {
      kind: "info",
      severity: "low",
      field: "nextAction",
      title: "No obvious ambiguity detected",
      excerpt: text.slice(0, 180),
      why: "The heuristic checks did not find a notable gap. A person should still verify the handoff makes sense in context.",
      question: "Do the owner, outcome, and timing match what the team agreed?"
    }, "looks-clear");
  }

  const explicitFacts = (Object.keys(fields) as FieldKey[])
    .filter((field) => fields[field].trim().length > 0)
    .map((field) => {
      const value = fields[field];
      return { field, value, evidence: sourceEvidence(originalMessage, field, value) };
    });

  return {
    originalMessage,
    fields,
    findings,
    explicitFacts,
    characterCount: input.length
  };
}

export function generateHandoff(
  fields: HandoffFields,
  findings: Finding[],
  manualEdits: Partial<HandoffFields> = {},
  fieldsToReview: FieldKey[] = []
): string {
  const valueOrPlaceholder = (value: string, placeholder: string) =>
    value.trim() || "[" + placeholder + "]";
  const deadlineNeedsConfirmation =
    findings.some((finding) => finding.id === "relative-deadline") &&
    Boolean(fields.deadline.trim()) &&
    !hasSpecificDeadline(fields.deadline);
  const deadlineValue = fields.deadline.trim()
    ? fields.deadline.trim() + (deadlineNeedsConfirmation ? " (confirm exact date/time)" : "")
    : "[Confirm exact date and time]";

  const lines = [
    "TASK HANDOFF",
    "",
    "Task: " + valueOrPlaceholder(fields.taskTitle, "Confirm task title"),
    "Owner: " + valueOrPlaceholder(fields.owner, "Confirm owner"),
    "Recipient: " + valueOrPlaceholder(fields.recipient, "Confirm recipient or destination"),
    "Expected outcome: " + valueOrPlaceholder(fields.deliverable, "Define deliverable and acceptance criteria"),
    "Deadline: " + deadlineValue,
    "Dependencies: " + valueOrPlaceholder(fields.dependency, "Confirm dependencies, or mark none"),
    "Immediate next step: " + valueOrPlaceholder(fields.nextAction, "Confirm the first actionable step"),
    "",
    "OPEN QUESTIONS"
  ];

  const openQuestions = getUnresolvedFindings(findings, manualEdits, fieldsToReview)
    .map((finding) => "- " + finding.question);

  const uniqueQuestions = [...new Set(openQuestions)];
  lines.push(...(uniqueQuestions.length ? uniqueQuestions : ["- No open questions from the current rule checks. Please verify the details with the people involved."]));
  lines.push("", "Note: Fill or confirm bracketed details before sending.");
  return lines.join("\n");
}
