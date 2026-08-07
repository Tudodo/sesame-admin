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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = "暂无数据",
  onRowClick,
  rowClassName,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  serverSide = false,
  total,
  pageIndex,
  onPageChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalPagination, setInternalPagination] = React.useState({
    pageIndex: 0,
    pageSize,
  });

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
    getSortedRowModel: getSortedRowModel(),
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

  return (
    <div className="space-y-4">
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
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
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
                    onRowClick && "cursor-pointer",
                    row.getIsSelected() && "bg-muted/30",
                    rowClassName?.(row.original),
                  )}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
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
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            第 {(pagination.pageIndex ?? 0) + 1} / {totalPages} 页， 共{" "}
            {totalCount} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (serverSide) {
                  onPageChange?.((pageIndex ?? 0) - 1);
                } else {
                  table.previousPage();
                }
              }}
              disabled={!canPrevious}
              aria-label="上一页"
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (serverSide) {
                  onPageChange?.((pageIndex ?? 0) + 1);
                } else {
                  table.nextPage();
                }
              }}
              disabled={!canNext}
              aria-label="下一页"
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper to create a selection column for use with enableRowSelection. */
export function createSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }: { table: TanstackTable<TData> }) => (
      <Checkbox
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
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="选择此行"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}
