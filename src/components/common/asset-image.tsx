import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Game cards and team crests (5.2–5.4).
 *
 * `GameCategory.cardImage`, `Team.image` and `User.avatar` accept three shapes —
 * a site path, an absolute URL, or a data URL. `next/image` only handles the
 * first without configuration and throws on the third, so only local paths take
 * the optimiser; anything else falls back to a plain tag rather than breaking
 * the page.
 *
 * A Cloudinary URL stays on that plain-tag path deliberately, not by accident:
 * `lib/storage/cloudinary.ts` bakes `c_fill,w_,h_,f_auto,q_auto` into the URL,
 * so the CDN already sends an exactly-sized AVIF. Re-optimising that through
 * `next/image` would pay for the same work twice and spend Vercel's quota on it.
 *
 * `eager` is what used to be `priority` (9.5). Next 16 deprecated that prop and
 * it now emits no hint at all, which is how the first lobby tile — the LCP
 * element — ended up loading at default priority behind eleven others. The two
 * attributes below are what it used to stand for, and the Next 16 docs
 * recommend them over `preload` whenever the LCP candidate depends on the
 * viewport, which on a responsive grid of tiles it does.
 */
export function AssetImage({
  src,
  alt,
  width,
  height,
  className,
  sizes,
  fill,
  eager,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  fill?: boolean;
  /** Above the fold: load immediately, ahead of the lazy images below it. */
  eager?: boolean;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        className={cn(
          "bg-muted text-muted-foreground/60 flex items-center justify-center",
          fill && "absolute inset-0",
          className,
        )}
      >
        <ImageIcon className="size-6" />
      </span>
    );
  }

  const loadingProps = eager
    ? ({ loading: "eager", fetchPriority: "high" } as const)
    : ({ loading: "lazy" } as const);

  if (src.startsWith("/")) {
    return fill ? (
      <Image src={src} alt={alt} fill sizes={sizes} className={className} {...loadingProps} />
    ) : (
      <Image
        src={src}
        alt={alt}
        width={width ?? 64}
        height={height ?? 64}
        sizes={sizes}
        className={className}
        {...loadingProps}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate: see the file comment.
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : (width ?? 64)}
      height={fill ? undefined : (height ?? 64)}
      decoding="async"
      className={cn(fill && "absolute inset-0 size-full object-cover", className)}
      {...loadingProps}
    />
  );
}
