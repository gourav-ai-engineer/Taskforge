export type FieldKey =
  | "taskTitle"
  | "owner"
  | "recipient"
  | "deliverable"
  | "deadline"
  | "dependency"
  | "nextAction";

export type FindingKind = "missing" | "ambiguous" | "conflicting";
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

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

function capture(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1].replace(/[.!?]+$/, ""));
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
    /\b(?:depends on|blocked by|after|once|when)\s+([^\n.!?]+)/i,
    /\b(?:prerequisite|dependency)\s*:\s*([^\n.!?]+)/i
  ]);

  fields.nextAction = capture(text, [
    /\bnext action\s*:\s*([^\n.!?]+)/i,
    /\bnext step\s*:\s*([^\n.!?]+)/i,
    /\b(?:first|initially|start by)\s+([^\n.!?]+)/i
  ]);

  return fields;
}

export function analyzeMessage(
  input: string,
  options: AnalysisOptions = { requiredFields: DEFAULT_REQUIRED_FIELDS }
): AnalysisResult {
  const originalMessage = input.trim();
  const text = normalizeWhitespace(originalMessage);
  const fields = findFacts(originalMessage);
  const findings: Finding[] = [];
  const required = new Set(options.requiredFields);

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

  const deadlineSignal = /\b(?:asap|soon|shortly|later|before the meeting|by the meeting|end of day|eod|tomorrow|tonight|today|next week|next month|by friday|by monday|by tuesday|by wednesday|by thursday|by saturday|by sunday)\b/i;
  const hasDeadline = Boolean(fields.deadline) || deadlineSignal.test(text);
  const relativeDeadline = /\b(?:asap|soon|shortly|later|before the meeting|by the meeting|end of day|eod|tomorrow|tonight|today|next week|next month|by friday|by monday|by tuesday|by wednesday|by thursday|by saturday|by sunday)\b/i;
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
  } else if (required.has("deadline") && relativeDeadline.test(text)) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "medium",
      field: "deadline",
      title: "Timing may be relative or unclear",
      excerpt: sentenceExcerpt(originalMessage, relativeDeadline) || text.slice(0, 180),
      why: "Phrases such as “soon” or “before the meeting” depend on context and do not identify a specific time.",
      question: "What exact date and time does this deadline refer to?"
    }, "relative-deadline");
    if (fields.deadline) fields.deadline = "";
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

  const pronounPattern = /\b(?:it|this|that|these|those|them|there)\b/i;
  if (pronounPattern.test(text) && /\b(?:send|share|finish|complete|review|fix|update|change|submit|do)\b/i.test(text)) {
    const pronounExcerpt = sentenceExcerpt(originalMessage, pronounPattern);
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

  const actionWords = text.match(/\b(?:and then|then|also|after that|before that|first|finally|next)\b/gi) || [];
  if (actionWords.length > 0 && /\b(?:and then|then|after that|before that|first|finally|next)\b/i.test(text)) {
    addFinding(findings, {
      kind: "ambiguous",
      severity: "low",
      field: "nextAction",
      title: "Sequence may need to be made explicit",
      excerpt: sentenceExcerpt(originalMessage, /\b(?:and then|then|after that|before that|first|finally|next)\b/i) || text.slice(0, 180),
      why: "Multiple steps are mentioned, but their order or completion boundary may be unclear.",
      question: "What is the first action, and what should happen only after it is complete?"
    }, "multi-step-sequence");
  }

  const timingMentions = text.match(/\b(?:today|tomorrow|tonight|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|next week|next month|ASAP|soon|EOD|end of day)\b/gi) || [];
  const uniqueTimingMentions = [...new Set(timingMentions.map((value) => value.toLowerCase()))];
  if (uniqueTimingMentions.length >= 2 && /\b(?:by|before|after|due|deadline)\b/i.test(text)) {
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

  if (required.has("nextAction") && !fields.nextAction && !/\b(?:please|can you|could you|need to|must|should|complete|prepare|create|review|send|build|test|update|submit|finish|analyze|analyse)\b/i.test(text)) {
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
      kind: "missing",
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
      const matchedLine = originalMessage
        .split(/\r?\n/)
        .find((line) => line.toLowerCase().includes(value.toLowerCase()));
      const valueIndex = originalMessage.toLowerCase().indexOf(value.toLowerCase());
      const evidence = matchedLine
        ? normalizeWhitespace(matchedLine).slice(0, 180)
        : valueIndex >= 0
          ? normalizeWhitespace(originalMessage.slice(Math.max(0, valueIndex - 35), Math.min(originalMessage.length, valueIndex + value.length + 35))).slice(0, 180)
          : value;
      return { field, value, evidence };
    });

  return {
    originalMessage,
    fields,
    findings,
    explicitFacts,
    characterCount: input.length
  };
}

export function generateHandoff(fields: HandoffFields, findings: Finding[]): string {
  const valueOrPlaceholder = (value: string, placeholder: string) =>
    value.trim() || "[" + placeholder + "]";

  const lines = [
    "TASK HANDOFF",
    "",
    "Task: " + valueOrPlaceholder(fields.taskTitle, "Confirm task title"),
    "Owner: " + valueOrPlaceholder(fields.owner, "Confirm owner"),
    "Recipient: " + valueOrPlaceholder(fields.recipient, "Confirm recipient or destination"),
    "Expected outcome: " + valueOrPlaceholder(fields.deliverable, "Define deliverable and acceptance criteria"),
    "Deadline: " + valueOrPlaceholder(fields.deadline, "Confirm exact date and time"),
    "Dependencies: " + valueOrPlaceholder(fields.dependency, "Confirm dependencies, or mark none"),
    "Immediate next step: " + valueOrPlaceholder(fields.nextAction, "Confirm the first actionable step"),
    "",
    "OPEN QUESTIONS"
  ];

  const openQuestions = findings
    .filter((finding) => finding.id !== "looks-clear")
    .filter((finding) => {
      const value = fields[finding.field];
      return !value || !value.trim();
    })
    .map((finding) => "- " + finding.question);

  const uniqueQuestions = [...new Set(openQuestions)];
  lines.push(...(uniqueQuestions.length ? uniqueQuestions : ["- No open questions from the current rule checks. Please verify the details with the people involved."]));
  lines.push("", "Note: Fill or confirm bracketed details before sending.");
  return lines.join("\n");
}
