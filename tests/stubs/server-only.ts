/**
 * Stands in for the `server-only` package under Vitest.
 *
 * The real module throws unless the resolver runs with the `react-server`
 * condition, which is what stops a server module being pulled into a client
 * bundle. Under the test runner there is no client bundle to protect, so this
 * resolves to nothing at all — `vitest.config.ts` aliases the specifier here.
 */
export {};
