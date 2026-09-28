import { describe, expect, it } from "vitest";
import { identityFor, looksLikeName, ownerLabel, resolveOwner } from "./owner";

// Fictional people. Manager and direct report share a first name on purpose.
const people = [
  { id: "mgr", name: "Alex Morgan" },
  { id: "dir", name: "Alex Rivera" },
  { id: "peer", name: "Priya Shah" },
];

const onManager = identityFor({
  person: people[0],
  people,
  selfName: "Jordan Park",
  noteOwnerName: "Jordan Park",
  noteOwnerEmail: "jordan@example.com",
});
const onDirect = identityFor({ person: people[1], people, selfName: "Jordan Park" });

describe("resolveOwner", () => {
  it("recognizes me by self words, first name, full name, and email", () => {
    for (const hint of ["me", "I", "myself", "Jordan", "Jordan Park", "Park", "jordan@example.com"]) {
      expect(resolveOwner(hint, onManager).kind).toBe("me");
    }
  });

  it("recognizes me from the Granola note owner even without a saved name", () => {
    const identity = identityFor({ person: people[0], people, selfName: "", noteOwnerName: "Jordan Park" });
    expect(resolveOwner("Jordan", identity).kind).toBe("me");
  });

  it("resolves the shared first name to whoever's page it is", () => {
    expect(resolveOwner("Alex", onManager)).toEqual({ kind: "them", name: "Alex Morgan" });
    expect(resolveOwner("Alex", onDirect)).toEqual({ kind: "them", name: "Alex Rivera" });
  });

  it("prefers full and last names when first names collide", () => {
    expect(resolveOwner("Alex Rivera", onManager)).toEqual({ kind: "other", name: "Alex Rivera" });
    expect(resolveOwner("Rivera", onManager)).toEqual({ kind: "other", name: "Alex Rivera" });
    expect(resolveOwner("Morgan", onManager)).toEqual({ kind: "them", name: "Alex Morgan" });
    expect(resolveOwner("Alex R.", onManager)).toEqual({ kind: "other", name: "Alex Rivera" });
    expect(resolveOwner("@Morgan", onDirect)).toEqual({ kind: "other", name: "Alex Morgan" });
  });

  it("is unassigned when a bare first name matches two people off their pages", () => {
    const onPeer = identityFor({ person: people[2], people, selfName: "Jordan Park" });
    expect(resolveOwner("Alex", onPeer).kind).toBe("unassigned");
  });

  it("keeps unknown strong names as other and drops weak or non-name hints", () => {
    expect(resolveOwner("Casey Nguyen", onManager)).toEqual({ kind: "other", name: "Casey Nguyen" });
    expect(resolveOwner("Casey", onManager, "weak").kind).toBe("unassigned");
    expect(resolveOwner("Priya", onManager, "weak")).toEqual({ kind: "other", name: "Priya Shah" });
    expect(resolveOwner("Friday", onManager).kind).toBe("unassigned");
    expect(resolveOwner("", onManager).kind).toBe("unassigned");
  });
});

describe("helpers", () => {
  it("labels and name checks", () => {
    expect(looksLikeName("Alex Rivera")).toBe(true);
    expect(looksLikeName("Schedule Review")).toBe(false);
    expect(looksLikeName("send it")).toBe(false);
    expect(ownerLabel({ ownerKind: "them", owner: "" }, "Alex Morgan")).toBe("Alex");
    expect(ownerLabel({ ownerKind: "other", owner: "Priya Shah" }, "Alex Morgan")).toBe("Priya Shah");
    expect(ownerLabel({ ownerKind: "unassigned", owner: "" }, "Alex Morgan")).toBe("Unassigned");
  });
});
