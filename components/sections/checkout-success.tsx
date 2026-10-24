"use client";

import * as React from "react";
import { motion } from "motion/react";
import { KeyRound, X } from "lucide-react";

import { checkoutSuccess } from "@/lib/copy";
import { site } from "@/lib/site";

/** No-op subscription: popstate is irrelevant while the flag is in the URL. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** Drop `?checkout=...` from the current URL without navigating. */
function stripCheckoutFlag(): void {
  const params = new URLSearchParams(window.location.search);
  params.delete("checkout");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

/**
 * Snapshot of `?checkout=success`. False on the server and during
 * hydration — the landing page stays statically prerendered with no
 * hydration mismatch — then the real value once React re-checks the client
 * snapshot after hydration. Reading the URL this way (instead of a
 * `setState` inside an effect) avoids the extra synchronous render pass.
 */
function useCheckoutSuccessFlag(): boolean {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () =>
      new URLSearchParams(window.location.search).get("checkout") === "success",
    () => false,
  );
}

/**
 * Post-purchase confirmation for the Stripe Checkout `success_url`
 * (`/?checkout=success`, created by `GET /api/checkout`).
 *
 * The flag stays in the URL for as long as the banner is visible — it is
 * only stripped via `history.replaceState` when the banner is dismissed
 * (auto after 15s, or manually). Stripping earlier would flip the
 * `useSyncExternalStore` snapshot to false and hide the banner on the
 * next render pass. After dismissal a refresh does not re-show it.
 */
export function CheckoutSuccess() {
  const success = useCheckoutSuccessFlag();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      stripCheckoutFlag();
      setDismissed(true);
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function dismiss(): void {
    stripCheckoutFlag();
    setDismissed(true);
  }

  if (!success || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      role="status"
      className="border-brand/50 bg-surface/95 fixed right-4 bottom-4 left-4 z-50 max-w-sm rounded-2xl border p-4 shadow-2xl backdrop-blur sm:left-auto"
    >
      <div className="flex items-start gap-3">
        <span className="bg-signal/15 text-signal mt-0.5 grid size-8 shrink-0 place-items-center rounded-full">
          <KeyRound className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-ink text-sm font-semibold">
            {checkoutSuccess.title}
          </p>
          <p className="text-ink-muted mt-1 text-sm leading-relaxed">
            {checkoutSuccess.body}
          </p>
          <p className="text-ink-faint mt-2 text-xs leading-relaxed">
            {checkoutSuccess.help}{" "}
            <a
              href={`mailto:${site.email}`}
              className="text-brand-light underline underline-offset-2"
            >
              {site.email}
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          aria-label={checkoutSuccess.dismiss}
          onClick={dismiss}
          className="text-ink-faint hover:text-ink -m-1 shrink-0 p-1 transition-colors"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
