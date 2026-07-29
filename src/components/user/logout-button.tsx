import { LogOutIcon } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sign out. A form posting to the server action rather than an `onClick`, so it
 * is a real POST — a GET link would let any page on the internet log the user
 * out by embedding an image.
 */
export function LogoutButton({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "full";
  className?: string;
}) {
  return (
    <form action={logoutAction} className={cn(variant === "full" && "w-full", className)}>
      {variant === "icon" ? (
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Log out"
          title="Log out"
        >
          <LogOutIcon />
        </Button>
      ) : (
        <Button type="submit" variant="outline" className="h-11 w-full justify-center md:h-10">
          <LogOutIcon />
          Log out
        </Button>
      )}
    </form>
  );
}
