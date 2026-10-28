import { describe, expect, it } from "vitest";
import { IllegalTransition, LINE_STATUSES, canLine, nextJobStatus, nextLineStatus } from "../src/index.ts";

describe("line state machine", () => {
  it("walks the happy path", () => {
    let s = nextLineStatus("PENDING", "TOKEN_ISSUED");
    expect(s).toBe("PROVING");
    s = nextLineStatus(s, "VERDICT_VERIFIED");
    s = nextLineStatus(s, "AUTO_APPROVE");
    expect(s).toBe("APPROVED");
    expect(nextLineStatus(s, "CAPTURED")).toBe("CAPTURED");
  });

  it("never lets silence approve a Needs review line", () => {
    expect(() => nextLineStatus("NEEDS_REVIEW", "AUTO_APPROVE")).toThrow(IllegalTransition);
    expect(nextLineStatus("NEEDS_REVIEW", "APPROVE")).toBe("APPROVED");
  });

  it("can't capture a line that wasn't approved", () => {
    for (const s of LINE_STATUSES.filter((x) => x !== "APPROVED")) expect(canLine(s, "CAPTURED")).toBe(false);
  });

  it("loops failed and flagged lines back to proving", () => {
    expect(nextLineStatus("FAILED", "TOKEN_ISSUED")).toBe("PROVING");
    expect(nextLineStatus("FLAGGED", "TOKEN_ISSUED")).toBe("PROVING");
  });

  it("drops anything not yet captured", () => {
    expect(nextLineStatus("APPROVED", "DROP")).toBe("DROPPED");
    expect(() => nextLineStatus("CAPTURED", "DROP")).toThrow(IllegalTransition);
  });
});

describe("job state machine", () => {
  it("follows section 8", () => {
    let s = nextJobStatus("DRAFT", "SCOPE_SENT");
    s = nextJobStatus(s, "AUTHORIZED");
    s = nextJobStatus(s, "FIRST_PROOF");
    s = nextJobStatus(s, "PARTIAL_RELEASE");
    expect(s).toBe("PARTIALLY_RELEASED");
    expect(nextJobStatus(s, "PARTIAL_RELEASE")).toBe("PARTIALLY_RELEASED");
    expect(nextJobStatus(s, "COMPLETED")).toBe("COMPLETED");
  });

  it("refuses to skip approval or reopen a closed job", () => {
    expect(() => nextJobStatus("DRAFT", "AUTHORIZED")).toThrow(IllegalTransition);
    expect(() => nextJobStatus("CLOSED_VOIDED", "VOIDED")).toThrow(IllegalTransition);
    expect(() => nextJobStatus("PARTIALLY_RELEASED", "FIRST_PROOF")).toThrow(IllegalTransition);
  });
});
