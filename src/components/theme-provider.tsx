"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * BuggedOut ships dark-only (see _ai_context/TODO.md decisions), so the theme is
 * forced rather than user-switchable. The provider still wraps the app so
 * `useTheme()` consumers (e.g. the sonner Toaster) resolve to "dark".
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
