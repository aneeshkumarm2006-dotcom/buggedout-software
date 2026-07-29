"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildAdminHref, withParam, type HrefParams } from "@/lib/admin/list-params";
import { cn } from "@/lib/utils";

/**
 * Search + filters for every admin table (Phase 6.1).
 *
 * The query *is* the state: each control pushes a new URL and the server
 * component re-runs its query, which is what makes a filtered list shareable,
 * refreshable and back-button-friendly. Nothing is fetched in the browser.
 *
 * `params` comes down from the page rather than `useSearchParams()` so this
 * never forces a Suspense boundary on a page that doesn't otherwise need one.
 */
export type FilterOption = { value: string; label: string };

export type ToolbarFilter = {
  /** Query-string key, e.g. `status`. */
  name: string;
  label: string;
  /** The value currently in the URL; `undefined` means "no filter". */
  value: string | undefined;
  options: FilterOption[];
  allLabel?: string;
};

/** Radix rejects an item with an empty value, so "no filter" needs a stand-in. */
const ALL = "__all__";

export function ListToolbar({
  pathname,
  params,
  filters = [],
  searchPlaceholder = "Search…",
  searchable = true,
  className,
}: {
  pathname: string;
  params: HrefParams;
  filters?: ToolbarFilter[];
  searchPlaceholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(String(params.q ?? ""));

  const hasFilters =
    !!String(params.q ?? "") || filters.some((filter) => filter.value !== undefined);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    router.push(buildAdminHref(pathname, { ...params, q: term.trim() || undefined, page: undefined }));
  }

  return (
    // Stacked on a phone, one row from `sm` up. Squeezing a search box, its
    // button and two selects onto a 360px row leaves none of them usable.
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end", className)}>
      {searchable ? (
        <form onSubmit={submitSearch} className="flex w-full items-end gap-2 sm:w-72">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="admin-search" className="text-muted-foreground text-xs">
              Search
            </Label>
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="admin-search"
                name="q"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={searchPlaceholder}
                maxLength={120}
                className="h-10 pl-8 sm:h-9"
              />
            </div>
          </div>

          <Button type="submit" variant="outline" size="lg" className="h-10 shrink-0 sm:h-9">
            Search
          </Button>
        </form>
      ) : null}

      {filters.length > 0 || hasFilters ? (
        <div className="flex flex-wrap items-end gap-2">
          {filters.map((filter) => (
            <div key={filter.name} className="grid min-w-0 flex-1 gap-1.5 sm:flex-none">
              <Label className="text-muted-foreground text-xs">{filter.label}</Label>

              <Select
                value={filter.value ?? ALL}
                onValueChange={(value) =>
                  router.push(
                    withParam(pathname, params, filter.name, value === ALL ? undefined : value),
                  )
                }
              >
                <SelectTrigger size="default" className="h-10 w-full sm:h-9 sm:w-auto sm:min-w-36">
                  <SelectValue placeholder={filter.allLabel ?? "All"} />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value={ALL}>{filter.allLabel ?? "All"}</SelectItem>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-10 shrink-0 sm:h-9"
              onClick={() => {
                setTerm("");
                router.push(pathname);
              }}
            >
              <XIcon />
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
