import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2 } from "lucide-react";

type PaginationItem = number | "left-ellipsis" | "right-ellipsis";
const ELLIPSIS_PAGE_JUMP = 5;
// Number of skeleton placeholder rows shown during initial table load.
const SKELETON_ROWS = 5;

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }
  const pages = Array.from(
    new Set([0, currentPage - 1, currentPage, currentPage + 1, totalPages - 1]),
  )
    .filter((page) => page >= 0 && page < totalPages)
    .sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous = -1;
  for (const page of pages) {
    if (page - previous > 1) {
      items.push(page > currentPage ? "right-ellipsis" : "left-ellipsis");
    }
    items.push(page);
    previous = page;
  }
  return items;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  /** Shows a loading message when the current page has no rows yet. */
  loading?: boolean;
  loadingMessage?: string;
  onRowClick?: (row: TData) => void;
  /** Human-readable label for keyboard/screen-reader row activation. */
  getRowClickLabel?: (row: TData) => string;
  rowClassName?: (row: TData) => string;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: React.Dispatch<
    React.SetStateAction<RowSelectionState>
  >;
  /** Returns a stable row id for selection state; defaults to row index.
   */
  getRowId?: (row: TData, index: number) => string;
  /** Server-side pagination: data is already the current page. */
  serverSide?: boolean;
  /** Total record count for server-side pagination. */
  total?: number;
  /** Current 0-based page index for server-side pagination. */
  pageIndex?: number;
  /** Called when the user navigates to a different page (server-side). */
  onPageChange?: (pageIndex: number) => void;
  /** Called when the user changes rows per page (server-side). */
  onPageSizeChange?: (pageSize: number) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  emptyMessage = "暂无数据",
  loading = false,
  loadingMessage = "加载中…",
  onRowClick,
  getRowClickLabel,
  rowClassName,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  serverSide = false,
  total,
  pageIndex,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalPagination, setInternalPagination] = React.useState({
    pageIndex: 0,
    pageSize,
  });
  const lastPageFallbackRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!serverSide || total === undefined || pageIndex === undefined) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (pageIndex > maxPage) {
      if (lastPageFallbackRef.current === pageIndex) return;
      lastPageFallbackRef.current = pageIndex;
      onPageChange?.(maxPage);
    } else {
      lastPageFallbackRef.current = null;
    }
  }, [serverSide, total, pageIndex, pageSize, onPageChange]);

  // For server-side mode, pagination state is controlled externally.
  const pagination = serverSide
    ? { pageIndex: pageIndex ?? 0, pageSize }
    : internalPagination;

  const handlePaginationChange = React.useCallback(
    (
      updater: React.SetStateAction<{ pageIndex: number; pageSize: number }>,
    ) => {
      if (serverSide && onPageChange) {
        const next =
          typeof updater === "function" ? updater(pagination) : updater;
        onPageChange(next.pageIndex);
      } else {
        setInternalPagination(updater);
      }
    },
    [serverSide, onPageChange, pagination],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Skip client-side pagination row model in server-side mode — data is
    // already the current page.
    ...(serverSide ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    // Server-side tables receive already ordered pages; do not sort only the
    // current page locally, which would look like global sorting.
    enableSorting: !serverSide,
    ...(serverSide ? {} : { getSortedRowModel: getSortedRowModel() }),
    manualSorting: serverSide,
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    manualPagination: serverSide,
    pageCount:
      serverSide && total !== undefined
        ? Math.max(1, Math.ceil(total / pageSize))
        : undefined,
    state: {
      sorting,
      pagination,
      ...(enableRowSelection && rowSelection ? { rowSelection } : {}),
    },
    enableRowSelection,
    ...(enableRowSelection && onRowSelectionChange
      ? { onRowSelectionChange }
      : {}),
    ...(getRowId ? { getRowId } : {}),
  });

  const totalPages =
    serverSide && total !== undefined
      ? Math.max(1, Math.ceil(total / pageSize))
      : table.getPageCount();
  const totalCount = serverSide && total !== undefined ? total : data.length;
  const canPrevious = serverSide
    ? (pageIndex ?? 0) > 0
    : table.getCanPreviousPage();
  const canNext = serverSide
    ? (pageIndex ?? 0) < totalPages - 1
    : table.getCanNextPage();

  const currentPage = pagination.pageIndex ?? 0;
  const currentPageSize = pagination.pageSize ?? pageSize;
  const effectivePageSizeOptions = Array.from(
    new Set([...pageSizeOptions, currentPageSize]),
  ).sort((a, b) => a - b);
  const showPageSizeSelector = !serverSide || !!onPageSizeChange;

  const goToPage = (page: number) => {
    if (serverSide) {
      onPageChange?.(page);
    } else {
      table.setPageIndex(page);
    }
  };

  const rowClickEnabled = !!onRowClick && !loading;
  return (
    <div className="space-y-4" aria-busy={loading || undefined}>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-10 px-3 text-sm font-medium"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    rowClickEnabled && "cursor-pointer",
                    rowClickEnabled &&
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    row.getIsSelected() && "bg-muted/30",
                    rowClassName?.(row.original),
                  )}
                  onClick={
                    rowClickEnabled ? () => onRowClick(row.original) : undefined
                  }
                  role={rowClickEnabled ? "button" : undefined}
                  tabIndex={rowClickEnabled ? 0 : undefined}
                  aria-label={
                    rowClickEnabled
                      ? (getRowClickLabel?.(row.original) ?? "选择此行")
                      : undefined
                  }
                  onKeyDown={
                    rowClickEnabled
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-3 py-2 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : loading ? (
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_, colIndex) => (
                    <TableCell
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
                      key={`skeleton-${i}-${colIndex}`}
                      className="px-3 py-2.5"
                    >
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  <output aria-live="polite" aria-atomic="true">
                    {emptyMessage}
                  </output>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {loading && table.getRowModel().rows.length > 0 && (
        <output
          aria-live="polite"
          aria-atomic="true"
          className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          {loadingMessage}
        </output>
      )}
      {(totalPages > 1 ||
        (serverSide && total !== undefined && total > currentPageSize)) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-sm text-muted-foreground"
          >
            {totalPages > 1
              ? `第 ${currentPage + 1} / ${totalPages} 页，共 ${totalCount} 条`
              : `共 ${totalCount} 条`}
          </p>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={!canPrevious || loading}
                aria-label="上一页"
              >
                上一页
              </Button>
              {getPaginationItems(currentPage, totalPages).map((item) =>
                item === "left-ellipsis" || item === "right-ellipsis" ? (
                  <Button
                    key={item}
                    variant="outline"
                    size="sm"
                    className="min-w-9 px-2"
                    onClick={() =>
                      goToPage(
                        item === "left-ellipsis"
                          ? Math.max(0, currentPage - ELLIPSIS_PAGE_JUMP)
                          : Math.min(
                              totalPages - 1,
                              currentPage + ELLIPSIS_PAGE_JUMP,
                            ),
                      )
                    }
                    disabled={loading}
                    aria-label={
                      item === "left-ellipsis" ? "向前跳 5 页" : "向后跳 5 页"
                    }
                    title={
                      item === "left-ellipsis" ? "向前跳 5 页" : "向后跳 5 页"
                    }
                  >
                    ...
                  </Button>
                ) : (
                  <Button
                    key={item}
                    variant={item === currentPage ? "default" : "outline"}
                    size="sm"
                    className="min-w-9 px-2"
                    onClick={() => goToPage(item)}
                    aria-current={item === currentPage ? "page" : undefined}
                    aria-label={`第 ${item + 1} 页`}
                    disabled={loading}
                  >
                    {item + 1}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={!canNext || loading}
                aria-label="下一页"
              >
                下一页
              </Button>
            </div>
          )}
          {showPageSizeSelector && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">每页</span>
              <Select
                value={String(currentPageSize)}
                onValueChange={(value) => {
                  const nextPageSize = Number(value);
                  if (serverSide) {
                    onPageSizeChange?.(nextPageSize);
                  } else {
                    setInternalPagination({
                      pageIndex: 0,
                      pageSize: nextPageSize,
                    });
                  }
                }}
                disabled={loading}
              >
                <SelectTrigger
                  className="h-8 w-20"
                  aria-label="每页条数"
                  aria-busy={loading || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effectivePageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">条</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Helper to create a selection column for use with enableRowSelection. */
export function createSelectionColumn<TData>(
  getRowLabel?: (row: TData) => string,
  disabled = false,
): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }: { table: TanstackTable<TData> }) => (
      <Checkbox
        disabled={disabled}
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="全选"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        disabled={disabled}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={getRowLabel ? getRowLabel(row.original) : "选择此行"}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}
