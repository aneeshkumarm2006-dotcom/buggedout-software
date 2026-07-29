"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * The toast that survives the redirect after a create (Phase 6.1).
 *
 * An action that redirects can't return a `FormState` for the form to toast —
 * the form is gone — so the message rides along in `?flash=` and is raised here
 * on arrival. The ref stops a re-render (or React's development double-invoke)
 * from showing it twice.
 */
export function FlashToast({
  message,
  tone = "success",
}: {
  message?: string;
  tone?: "success" | "error" | "info";
}) {
  const shown = useRef(false);

  useEffect(() => {
    if (!message || shown.current) return;

    shown.current = true;
    toast[tone](message);
  }, [message, tone]);

  return null;
}
