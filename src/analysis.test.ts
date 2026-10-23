import { describe, expect, it } from "vitest";
import {
  analyzeMessage,
  applyManualFieldEdits,
  getUnresolvedFindings,
  generateHandoff,
  MAX_MESSAGE_LENGTH,
  type HandoffFields
} from "./analysis";

describe("analyzeMessage", () => {
  it("returns a useful finding for empty input", () => {
    const result = analyzeMessage("   ");
    expect(result.findings[0]?.id).toBe("empty-message");
    expect(result.originalMessage).toBe("");
  });

  it("does not warn that owner, deliverable, and timing are missing in a structured handoff", () => {
    const message = "Task: Publish the weekly test summary\nOwner: Riya Sharma\nRecipient: QA team\nDeliverable: A Markdown report\nDeadline: Friday at 4:00 PM IST\nDependency: None\nNext action: Run the regression suite.";
    const result = analyzeMessage(message, { requiredFields: ["owner", "deliverable", "deadline", "recipient"] });
    expect(result.fields.owner).toBe("Riya Sharma");
    expect(result.fields.deliverable).toContain("Markdown report");
    expect(result.fields.deadline).toContain("Friday");
    expect(result.findings.map((finding) => finding.id)).not.toContain("missing-owner");
    expect(result.findings.map((finding) => finding.id)).not.toContain("missing-deliverable");
    expect(result.findings.map((finding) => finding.id)).not.toContain("missing-deadline");
  });

  it("flags an unspecified owner", () => {
    const result = analyzeMessage("Can someone finish the evaluation?", { requiredFields: ["owner"] });
    expect(result.findings.some((finding) => finding.id === "missing-owner")).toBe(true);
  });

  it("flags an unspecified deliverable", () => {
    const result = analyzeMessage("Riya will complete the task by Friday.", { requiredFields: ["deliverable"] });
    expect(result.findings.some((finding) => finding.id === "missing-deliverable")).toBe(true);
  });

  it("flags missing deadline when deadline is required", () => {
    const result = analyzeMessage("Owner: Riya\nDeliverable: Markdown report", { requiredFields: ["deadline"] });
    expect(result.findings.some((finding) => finding.id === "missing-deadline")).toBe(true);
  });

  it("flags relative deadlines rather than silently treating them as exact", () => {
    const result = analyzeMessage("Please prepare the report soon.", { requiredFields: ["deadline"] });
    expect(result.findings.some((finding) => finding.id === "relative-deadline")).toBe(true);
    expect(result.fields.deadline).toBe("");
  });

  it("preserves a known weekday while clearly marking exact timing as unconfirmed", () => {
    const result = analyzeMessage("After the API is ready, update the dashboard and then send it to Arjun by Friday.");
    expect(result.fields.deadline).toBe("Friday");
    const draft = generateHandoff(result.fields, result.findings);
    expect(draft).toContain("Deadline: Friday (confirm exact date/time)");
    expect(draft).toContain("What exact date and time does this deadline refer to?");
  });

  it("does not flag an explicit weekday and clock time as merely relative", () => {
    const result = analyzeMessage("Finish the report by Friday at 4 PM IST.", { requiredFields: ["deadline"] });
    expect(result.findings.some((finding) => finding.id === "relative-deadline")).toBe(false);
    expect(result.fields.deadline).toMatch(/Friday at 4 PM IST/i);
  });

  it("flags vague language and ambiguous references", () => {
    const result = analyzeMessage("Can someone finish it and send it over?");
    const ids = result.findings.map((finding) => finding.id);
    expect(ids).toContain("vague-action");
    expect(ids).toContain("ambiguous-reference");
  });

  it("flags a missing recipient when sending is mentioned and recipient is required", () => {
    const result = analyzeMessage("Please send the report by Friday.", { requiredFields: ["recipient"] });
    expect(result.findings.some((finding) => finding.id === "missing-recipient")).toBe(true);
  });

  it("does not require dependencies unless configured or suggested by the message", () => {
    const result = analyzeMessage("Owner: Riya\nDeliverable: report\nDeadline: Friday", { requiredFields: ["owner"] });
    expect(result.findings.some((finding) => finding.id === "missing-dependency")).toBe(false);
  });

  it("flags timing references that may conflict", () => {
    const result = analyzeMessage("Please send the report by Friday, but it is due Monday.");
    expect(result.findings.some((finding) => finding.id === "multiple-timing-references")).toBe(true);
  });

  it("does not treat a direct correction like Friday, not Monday as unresolved conflict", () => {
    const result = analyzeMessage("The deadline is Friday, not Monday.", { requiredFields: ["deadline"] });
    expect(result.findings.some((finding) => finding.id === "multiple-timing-references")).toBe(false);
    expect(result.fields.deadline).toBe("Friday");
  });

  it("respects an explicitly stated no-deadline requirement", () => {
    const result = analyzeMessage("No deadline is needed for this task.", { requiredFields: ["deadline"] });
    expect(result.findings.some((finding) => finding.id === "missing-deadline")).toBe(false);
    expect(result.fields.deadline).toMatch(/no deadline is needed/i);
  });

  it("captures only the prerequisite clause rather than the entire dependent instruction", () => {
    const result = analyzeMessage("After the API is ready, update the dashboard and then send it to Arjun by Friday.", {
      requiredFields: ["dependency"]
    });
    expect(result.fields.dependency).toBe("the API is ready");
  });

  it("recognizes an explicit absence of dependencies", () => {
    const result = analyzeMessage("Owner: Riya\nNo dependencies.\nDeliverable: report", { requiredFields: ["dependency"] });
    expect(result.fields.dependency).toMatch(/no dependencies/i);
    expect(result.findings.some((finding) => finding.id === "missing-dependency")).toBe(false);
  });

  it("does not flag a pronoun when a specific artifact was named immediately beforehand", () => {
    const report = analyzeMessage("Please prepare the weekly report by Friday and send it to the team.");
    const dashboard = analyzeMessage("After the API is ready, update the dashboard and then send it to Arjun by Friday.");
    expect(report.findings.some((finding) => finding.id === "ambiguous-reference")).toBe(false);
    expect(dashboard.findings.some((finding) => finding.id === "ambiguous-reference")).toBe(false);
  });

  it("does not treat an unrelated use of 'this' as an ambiguous task reference", () => {
    const result = analyzeMessage("Please complete this task by Friday.");
    expect(result.findings.some((finding) => finding.id === "ambiguous-reference")).toBe(false);
  });

  it("extracts a direct imperative as the next action when requested", () => {
    const result = analyzeMessage("Review the API by Friday.", { requiredFields: ["nextAction"] });
    expect(result.fields.nextAction).toMatch(/^Review the API by Friday/i);
    expect(result.findings.some((finding) => finding.id === "missing-next-action")).toBe(false);
  });

  it("flags a vague request with no identifiable next action when requested", () => {
    const result = analyzeMessage("We should make progress soon.", { requiredFields: ["nextAction"] });
    expect(result.findings.some((finding) => finding.id === "missing-next-action")).toBe(true);
  });

  it("does not flag an explicit action sequence as unclear", () => {
    const result = analyzeMessage("After the API is ready, update the dashboard and then send it to Arjun by Friday.");
    expect(result.findings.some((finding) => finding.id === "multi-step-sequence")).toBe(false);
    expect(result.findings.some((finding) => finding.id === "multiple-actions-no-sequence")).toBe(false);
  });

  it("flags combined actions when no order is made explicit", () => {
    const result = analyzeMessage("Can someone finish the evaluation and send it over before the meeting?");
    expect(result.findings.some((finding) => finding.id === "multiple-actions-no-sequence")).toBe(true);
  });

  it("extracts a recipient from a sentence with a named person", () => {
    const result = analyzeMessage(
      "Owner: Priya. Deliverable: Submit the final PDF report. Deadline: 2026-10-30 at 5 PM IST. Send the report to Arjun.",
      { requiredFields: ["owner", "deliverable", "deadline", "recipient"] }
    );
    expect(result.fields.recipient).toBe("Arjun");
    expect(result.findings.some((finding) => finding.id === "missing-recipient")).toBe(false);
  });

  it("extracts a team recipient and keeps deadline text from swallowing the next action", () => {
    const result = analyzeMessage(
      "Please prepare the weekly report by Friday and send it to the team.",
      { requiredFields: ["owner", "deliverable", "deadline", "recipient"] }
    );
    expect(result.fields.deadline).toBe("Friday");
    expect(result.fields.recipient.toLowerCase()).toBe("the team");
    expect(result.fields.deliverable.toLowerCase()).toContain("weekly report");
    expect(result.fields.nextAction.toLowerCase()).toBe("prepare the weekly report by friday");
  });

  it("extracts a named actor as the owner when the message says they will do the work", () => {
    const result = analyzeMessage(
      "Ravi will update the documentation and send the PDF to the project team.",
      { requiredFields: ["owner", "recipient", "deliverable"] }
    );
    expect(result.fields.owner).toBe("Ravi");
    expect(result.fields.recipient.toLowerCase()).toBe("the project team");
    expect(result.fields.deliverable.toLowerCase()).toContain("pdf");
    expect(result.findings.some((finding) => finding.id === "missing-owner")).toBe(false);
  });

  it("attaches source evidence to explicitly extracted facts", () => {
    const result = analyzeMessage("Owner: Riya Sharma\nDeliverable: Markdown report", { requiredFields: [] });
    expect(result.explicitFacts.find((fact) => fact.field === "owner")).toEqual({
      field: "owner",
      value: "Riya Sharma",
      evidence: "Owner: Riya Sharma"
    });
  });

  it("uses concise evidence for recipient and dependency facts in a natural sentence", () => {
    const result = analyzeMessage("After the API is ready, update the dashboard and then send it to Arjun by Friday.");
    const recipient = result.explicitFacts.find((fact) => fact.field === "recipient");
    const dependency = result.explicitFacts.find((fact) => fact.field === "dependency");
    expect(recipient?.evidence).toBe("send it to Arjun");
    expect(recipient?.evidence).not.toContain("Friday");
    expect(dependency?.evidence).toBe("After the API is ready");
    const deadline = result.explicitFacts.find((fact) => fact.field === "deadline");
    expect(deadline?.evidence).toBe("by Friday");
  });

  it("keeps unknown values empty rather than inventing them", () => {
    const result = analyzeMessage("Please complete the task.");
    expect(result.fields.owner).toBe("");
    expect(result.fields.deadline).toBe("");
  });

  it("records the original character count and trims the stored message", () => {
    const result = analyzeMessage("  Please review the report.  ");
    expect(result.originalMessage).toBe("Please review the report.");
    expect(result.characterCount).toBe(29);
  });

  it("exposes the maximum input size used by the UI", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(3000);
  });

  it("returns a clear validation finding for oversized input", () => {
    const result = analyzeMessage("x".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.id).toBe("message-too-long");
    expect(result.characterCount).toBe(MAX_MESSAGE_LENGTH + 1);
  });

  it("returns an informational result when common checks find no issue", () => {
    const result = analyzeMessage("Owner: Riya\nDeliverable: report\nDeadline: 12 December 2026");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.id === "looks-clear" || finding.severity === "low")).toBe(true);
  });
});

describe("applyManualFieldEdits", () => {
  const extracted: HandoffFields = {
    taskTitle: "Publish report",
    owner: "",
    recipient: "QA team",
    deliverable: "Markdown report",
    deadline: "Friday",
    dependency: "",
    nextAction: "Run tests"
  };

  it("preserves edited values when a changed source message is reanalyzed", () => {
    const merged = applyManualFieldEdits(extracted, {
      owner: "Riya",
      deadline: "Friday 4 PM IST"
    });
    expect(merged.owner).toBe("Riya");
    expect(merged.deadline).toBe("Friday 4 PM IST");
    expect(merged.recipient).toBe("QA team");
  });

  it("preserves a deliberately cleared field instead of restoring an extracted value", () => {
    const merged = applyManualFieldEdits(extracted, { recipient: "" });
    expect(merged.recipient).toBe("");
  });

  it("does not mutate the extracted object", () => {
    const merged = applyManualFieldEdits(extracted, { owner: "Riya" });
    expect(extracted.owner).toBe("");
    expect(merged.owner).toBe("Riya");
  });
});

describe("finding resolution", () => {
  it("marks a missing owner addressed only after the user supplies a value", () => {
    const finding = analyzeMessage("Can someone finish the evaluation?", { requiredFields: ["owner"] }).findings.find((item) => item.id === "missing-owner")!;
    expect(getUnresolvedFindings([finding])).toContainEqual(finding);
    expect(getUnresolvedFindings([finding], { owner: "Riya" })).toEqual([]);
    expect(getUnresolvedFindings([finding], { owner: "" })).toContainEqual(finding);
  });

  it("does not mark a relative deadline addressed when the user only types a weekday", () => {
    const finding = analyzeMessage("Please prepare the report soon.", { requiredFields: ["deadline"] }).findings.find((item) => item.id === "relative-deadline")!;
    expect(getUnresolvedFindings([finding], { deadline: "Friday" })).toContainEqual(finding);
    expect(getUnresolvedFindings([finding], { deadline: "Friday at 4 PM IST" })).toEqual([]);
  });

  it("keeps preserved fields unresolved until they are reviewed against the new message", () => {
    const finding = analyzeMessage("Can someone finish the evaluation?", { requiredFields: ["owner"] }).findings.find((item) => item.id === "missing-owner")!;
    expect(getUnresolvedFindings([finding], { owner: "Riya" }, ["owner"])).toContainEqual(finding);
    expect(getUnresolvedFindings([finding], { owner: "Riya" }, [])).toEqual([]);
  });
});

describe("generateHandoff", () => {
  const blankFields: HandoffFields = {
    taskTitle: "",
    owner: "",
    recipient: "",
    deliverable: "",
    deadline: "",
    dependency: "",
    nextAction: ""
  };

  it("leaves unconfirmed information as visible placeholders", () => {
    const draft = generateHandoff(blankFields, analyzeMessage("Please complete the evaluation.").findings);
    expect(draft).toContain("Owner: [Confirm owner]");
    expect(draft).toContain("Deadline: [Confirm exact date and time]");
    expect(draft).toContain("[Define deliverable and acceptance criteria]");
  });

  it("includes user-confirmed values in the generated handoff", () => {
    const fields = { ...blankFields, taskTitle: "Review API", owner: "Riya", deadline: "Friday 4 PM" };
    const draft = generateHandoff(fields, []);
    expect(draft).toContain("Task: Review API");
    expect(draft).toContain("Owner: Riya");
    expect(draft).toContain("Deadline: Friday 4 PM");
  });

  it("does not keep an open question after the user fills its field", () => {
    const finding = analyzeMessage("Can someone finish the evaluation?", { requiredFields: ["owner"] }).findings.find((item) => item.id === "missing-owner")!;
    const draft = generateHandoff({ ...blankFields, owner: "Riya" }, [finding], { owner: "Riya" });
    expect(draft).not.toContain(finding.question);
    expect(draft).toContain("Owner: Riya");
  });

  it("deduplicates open questions", () => {
    const findings = analyzeMessage("Please complete the task.").findings;
    const draft = generateHandoff(blankFields, findings);
    expect(draft).toContain("OPEN QUESTIONS");
    expect(draft).toContain("Fill or confirm bracketed details");
  });

  it("accepts a customized set of required fields", () => {
    const result = analyzeMessage("Please complete the task.", { requiredFields: [] });
    expect(result.findings.some((finding) => finding.id === "missing-owner")).toBe(false);
    expect(result.findings.some((finding) => finding.id === "missing-deadline")).toBe(false);
  });
});
