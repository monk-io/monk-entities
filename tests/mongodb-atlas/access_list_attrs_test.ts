// Unit tests for the pure access list attribute helpers (PRO-885).
// Kept outside src/ because the monkec compiler compiles every .ts file under a package.
// Run: deno test tests/mongodb-atlas/
import assert from "node:assert/strict";
import {
    accessListAttributeDrift,
    deleteAfterExpired,
    describeAttributeDrift,
    hasAttributeDrift,
    sameDeleteAfter,
} from "../../src/mongodb-atlas/access-list-attrs.ts";

Deno.test("no drift when comment and expiry match", () => {
    const d = accessListAttributeDrift(
        { comment: "a", deleteAfterDate: "2026-10-01T10:00:00Z" },
        { comment: "a", deleteAfterDate: "2026-10-01T10:00:00Z" },
    );
    assert.equal(hasAttributeDrift(d), false);
});

Deno.test("absent and empty comment are the same", () => {
    assert.equal(hasAttributeDrift(accessListAttributeDrift({}, { comment: "" })), false);
    assert.equal(hasAttributeDrift(accessListAttributeDrift({ comment: "" }, {})), false);
});

Deno.test("comment change is drift", () => {
    const want = { comment: "new" };
    const live = { comment: "old" };
    const d = accessListAttributeDrift(want, live);
    assert.equal(d.comment, true);
    assert.equal(d.deleteAfterDate, false);
    assert.equal(d.clearsDeleteAfter, false);
    assert.equal(describeAttributeDrift(d, want, live), 'comment ("old" -> "new")');
});

Deno.test("removing a comment is drift", () => {
    assert.equal(accessListAttributeDrift({}, { comment: "old" }).comment, true);
});

Deno.test("expiry spelled differently by Atlas is not drift", () => {
    assert.equal(sameDeleteAfter("2026-10-01T10:00:00Z", "2026-10-01T10:00:00.000+00:00"), true);
    assert.equal(sameDeleteAfter("2026-10-01T12:00:00+02:00", "2026-10-01T10:00:00Z"), true);
});

Deno.test("expiry change is drift", () => {
    const d = accessListAttributeDrift(
        { deleteAfterDate: "2026-10-02T10:00:00Z" },
        { deleteAfterDate: "2026-10-01T10:00:00Z" },
    );
    assert.equal(d.deleteAfterDate, true);
    assert.equal(d.clearsDeleteAfter, false);
});

Deno.test("adding an expiry is drift but does not clear one", () => {
    const d = accessListAttributeDrift({ deleteAfterDate: "2026-10-02T10:00:00Z" }, {});
    assert.equal(d.deleteAfterDate, true);
    assert.equal(d.clearsDeleteAfter, false);
});

Deno.test("removing an expiry is flagged as clearing it", () => {
    const d = accessListAttributeDrift({ comment: "a" }, { comment: "a", deleteAfterDate: "2026-10-01T10:00:00Z" });
    assert.equal(d.deleteAfterDate, true);
    assert.equal(d.clearsDeleteAfter, true);
});

Deno.test("unparseable expiries compare as strings", () => {
    assert.equal(sameDeleteAfter("soon", "soon"), true);
    assert.equal(sameDeleteAfter("soon", "later"), false);
});

Deno.test("deleteAfterExpired: past or now is expired", () => {
    const now = Date.parse("2026-10-01T10:00:00Z");
    assert.equal(deleteAfterExpired("2026-10-01T09:00:00Z", now), true);
    assert.equal(deleteAfterExpired("2026-10-01T10:00:00Z", now), true);
    assert.equal(deleteAfterExpired("2026-10-01T12:00:00+02:00", now), true);
});

Deno.test("deleteAfterExpired: future, absent or unparseable is not expired", () => {
    const now = Date.parse("2026-10-01T10:00:00Z");
    assert.equal(deleteAfterExpired("2026-10-01T10:00:01Z", now), false);
    assert.equal(deleteAfterExpired(undefined, now), false);
    assert.equal(deleteAfterExpired("", now), false);
    assert.equal(deleteAfterExpired("next tuesday", now), false);
});
