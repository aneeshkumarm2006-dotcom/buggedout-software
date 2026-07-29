"use client";

import { useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * The animated game card, played over the still one on desktop hover (8.3).
 *
 * Polish, so it is allowed to cost nothing when it cannot be seen. Three gates,
 * in order of how much they save:
 *
 *  1. A device that cannot hover never renders a `<video>` at all — a phone
 *     must not pay for a hover effect it has no way to trigger.
 *  2. `prefers-reduced-motion: reduce` is treated as "not wanted", not as
 *     "wanted but slower". These clips are a loop of moving neon.
 *  3. Nothing is fetched until the pointer actually lands on a tile. Ten cards
 *     at ~180KB is not a page load anyone asked for; one is a hover.
 *
 * Once fetched the element stays mounted and is paused instead, so moving back
 * and forth across a row is free after the first pass.
 *
 * The hover target is the whole tile rather than this layer, so the video
 * follows the same boundary as the card's own hover styling. That means finding
 * the anchor this sits inside: the layer is `pointer-events-none` (it must never
 * intercept the click) and the scrim and the LIVE badge overlap it, so listening
 * here would both miss and mis-fire.
 */
export function GameCardVideo({ src }: { src: string }) {
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const enabled = canHover && !reducedMotion;

  const hostRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const card = hostRef.current?.closest("a");
    if (!card) return;

    const enter = () => {
      setMounted(true);
      setHovered(true);
    };
    const leave = () => setHovered(false);

    card.addEventListener("pointerenter", enter);
    card.addEventListener("pointerleave", leave);

    return () => {
      card.removeEventListener("pointerenter", enter);
      card.removeEventListener("pointerleave", leave);
    };
  }, [enabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hovered) {
      // Muted autoplay is allowed everywhere, but a refusal is still possible
      // (a battery-saver mode, say) and it is not worth breaking the tile over —
      // the still card is already showing underneath.
      void video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [hovered, mounted]);

  return (
    <span ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0">
      {mounted ? (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setPainted(true)}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            // Held transparent until a frame has actually been painted, so the
            // still card never flicks to black while the first bytes arrive.
            hovered && painted ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </span>
  );
}
