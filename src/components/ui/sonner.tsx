"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          /*
           * Phase 7.5 — the Toaster is mounted with `richColors`, which
           * otherwise paints sonner's own green/red over a BuggedOut page. The
           * four states get the brand's instead: a bet lands in neon green, a
           * refusal in the HUD red, a warning in its gold, info in its cyan.
           * Tinting the popover rather than filling it keeps the toast part of
           * the surface it floats over.
           */
          "--success-bg": "color-mix(in oklch, var(--primary) 12%, var(--popover))",
          "--success-text": "var(--primary)",
          "--success-border": "color-mix(in oklch, var(--primary) 35%, transparent)",
          "--error-bg": "color-mix(in oklch, var(--destructive) 12%, var(--popover))",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in oklch, var(--destructive) 35%, transparent)",
          "--warning-bg": "color-mix(in oklch, var(--brand-gold) 12%, var(--popover))",
          "--warning-text": "var(--brand-gold)",
          "--warning-border": "color-mix(in oklch, var(--brand-gold) 35%, transparent)",
          "--info-bg": "color-mix(in oklch, var(--brand-cyan) 12%, var(--popover))",
          "--info-text": "var(--brand-cyan)",
          "--info-border": "color-mix(in oklch, var(--brand-cyan) 35%, transparent)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
