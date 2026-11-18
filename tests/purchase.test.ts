import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isSessionPaid,
  QUEUED_STALE_MS,
  requeueIfStale,
} from "@/lib/check/purchase";
import { checkReadySubject, checkReadyText } from "@/lib/email/check-ready";
import { loggableOutcome } from "@/lib/stripe/webhook";

describe("purchase", () => {
  test("paid and 100%-off sessions count as paid; unpaid does not", () => {
    assert.equal(isSessionPaid({ payment_status: "paid" }), true);
    assert.equal(
      isSessionPaid({ payment_status: "no_payment_required" }),
      true,
    );
    assert.equal(isSessionPaid({ payment_status: "unpaid" }), false);
  });

  test("a queued check is restartable only once it is stale", async () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const base = {
      id: "00000000-0000-4000-8000-000000000000",
      status: "queued" as const,
      createdAt: now,
      startedAt: null,
    };
    assert.equal(
      await requeueIfStale(
        { ...base, paidAt: new Date(now.getTime() - 5_000) },
        now,
      ),
      false,
    );
    assert.equal(
      await requeueIfStale(
        { ...base, paidAt: new Date(now.getTime() - QUEUED_STALE_MS) },
        now,
      ),
      true,
    );
  });

  test("complete / pending checks are never restarted", async () => {
    const now = new Date();
    for (const status of ["complete", "failed", "pending_payment"] as const) {
      assert.equal(
        await requeueIfStale(
          {
            id: "x",
            status,
            paidAt: null,
            createdAt: new Date(0),
            startedAt: null,
          },
          now,
        ),
        false,
      );
    }
  });

  test("the logged webhook outcome never contains the private token", () => {
    const logged = loggableOutcome({
      status: "check_queued",
      checkId: "abc",
      paid: { checkId: "abc", token: "secret-token-value" },
    });
    assert.ok(!JSON.stringify(logged).includes("secret-token-value"));
    assert.deepEqual(logged, { status: "check_queued", checkId: "abc" });
  });
});

describe("check-ready email", () => {
  const email = {
    to: "buyer@example.com",
    headline: "Invoice reminders for designers",
    verdict: "niche_down" as const,
    score: 68,
    url: "https://painproof.co/check/abc?t=tok",
  };

  test("subject shows verdict and score", () => {
    assert.equal(
      checkReadySubject(email),
      "Your PainProof check: Niche down (68/100)",
    );
    assert.equal(
      checkReadySubject({ ...email, verdict: "insufficient", score: null }),
      "Your PainProof check: Not enough evidence",
    );
  });

  test("text body carries the private link", () => {
    assert.match(
      checkReadyText(email),
      /https:\/\/painproof\.co\/check\/abc\?t=tok/,
    );
  });
});
