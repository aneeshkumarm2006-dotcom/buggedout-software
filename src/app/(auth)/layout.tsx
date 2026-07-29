import Image from "next/image";

/**
 * Login / signup / password reset (Phase 3), now with the key art on top (8.1).
 *
 * The full logotype rather than the header's wordmark: this is the only screen
 * a signed-out visitor sees, so it is the one place worth spending the flag and
 * the line-up on. It is also the only LCP candidate on the screen whatever the
 * viewport, which is the one case Next 16 still recommends `preload` for — the
 * `priority` prop it replaced no longer does anything (9.5).
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-7">
        <Image
          src="/logo.webp"
          alt="BuggedOut"
          width={958}
          height={518}
          preload
          sizes="280px"
          className="mx-auto h-auto w-56 sm:w-64"
        />

        {children}
      </div>
    </main>
  );
}
