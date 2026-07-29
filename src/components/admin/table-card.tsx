import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The bordered container every admin table sits in (Phase 6.1).
 *
 * The scroll lives on this element, not the page: admin tables are wide by
 * nature, and a phone should be able to swipe a column into view without the
 * whole layout sliding sideways.
 */
export function TableCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A "no rows" line that keeps the table's shape instead of replacing it. */
export function TableEmptyRow({
  colSpan,
  children = "Nothing here yet.",
}: {
  colSpan: number;
  children?: React.ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="text-muted-foreground h-28 text-center text-sm">
        {children}
      </TableCell>
    </TableRow>
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
