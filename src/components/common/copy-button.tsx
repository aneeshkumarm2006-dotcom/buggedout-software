"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copies a value to the clipboard (Phase 5.9's code and share link).
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be refused
 * by permission, so a failure says so and leaves the text on screen to be
 * selected by hand rather than silently doing nothing.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  function copy() {
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        // Reverting the label is cosmetic; a stray timer after unmount is
        // harmless, and cancelling it would need an effect just to hold a ref.
        setTimeout(() => setCopied(false), 2_000);
      } catch {
        toast.error("Couldn't copy — select the text and copy it manually.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={copy}
      className={className}
      aria-live="polite"
    >
      {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
