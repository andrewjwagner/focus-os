import { describe, expect, it } from "vitest";
import { finalTranscriptFromEvent, insertTranscript } from "./speech";

describe("insertTranscript", () => {
  it("appends with a space when the field already has text", () => {
    expect(insertTranscript("Call school", "tomorrow morning", 11, 11)).toEqual({
      next: "Call school tomorrow morning",
      caret: 28,
    });
  });

  it("inserts at the caret without doubling spaces", () => {
    expect(insertTranscript("alpha  omega", "bravo", 6, 6)).toEqual({
      next: "alpha bravo omega",
      caret: 11,
    });
  });

  it("replaces the current selection", () => {
    expect(insertTranscript("alpha bravo", "CHARLIE", 6, 11)).toEqual({
      next: "alpha CHARLIE",
      caret: 13,
    });
  });

  it("ignores blank transcripts", () => {
    expect(insertTranscript("keep", "   ", 4, 4)).toEqual({
      next: "keep",
      caret: 4,
    });
  });
});

describe("finalTranscriptFromEvent", () => {
  it("joins final chunks from resultIndex", () => {
    const spoken = finalTranscriptFromEvent({
      resultIndex: 1,
      results: [
        { 0: { transcript: "ignore" }, isFinal: true },
        { 0: { transcript: "call " }, isFinal: true },
        { 0: { transcript: "school" }, isFinal: true },
      ],
    });
    expect(spoken).toBe("call school");
  });
});
