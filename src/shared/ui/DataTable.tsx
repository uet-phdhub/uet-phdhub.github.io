import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export function DataTable<TData>({
  data,
  columns,
  loading = false,
  emptyTitle = 'Không có dữ liệu',
  emptyAction,
  onRowClick,
  toolbarLeft,
  toolbarRight,
  initialColumnVisibility = {},
  pageSize = 25,
}: {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: TData) => void;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  initialColumnVisibility?: VisibilityState;
  pageSize?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const hideableCols = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const { pageIndex, pageSize: currentSize } = table.getState().pagination;
  const totalRows = data.length;
  const startRow = totalRows === 0 ? 0 : pageIndex * currentSize + 1;
  const endRow = Math.min(totalRows, (pageIndex + 1) * currentSize);

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      {(toolbarLeft || toolbarRight || hideableCols.length > 0) && (
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-white rounded-t-lg">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{toolbarLeft}</div>
          <div className="flex items-center gap-2 shrink-0">
            {toolbarRight}
            {hideableCols.length > 0 && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="h-9 px-2.5 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                    title="Chọn cột hiển thị"
                  >
                    <Columns3 size={14} className="text-slate-500" />
                    <span>Cột</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                  >
                    {hideableCols.map((col) => (
                      <DropdownMenu.CheckboxItem
                        key={col.id}
                        checked={col.getIsVisible()}
                        onCheckedChange={(v) => col.toggleVisibility(Boolean(v))}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-slate-700 rounded hover:bg-slate-100 cursor-pointer outline-none"
                      >
                        <span className="truncate">{String(col.columnDef.meta?.label || col.id)}</span>
                        {col.getIsVisible() && <Check size={13} className="text-[#034ea1] shrink-0" />}
                      </DropdownMenu.CheckboxItem>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="uet-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'px-4 py-3',
                        canSort && 'cursor-pointer select-none hover:text-slate-900',
                        header.column.columnDef.meta?.align === 'right' && 'text-right'
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          header.column.columnDef.meta?.align === 'right' && 'justify-end'
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUp size={12} className="text-[#034ea1]" />}
                        {sorted === 'desc' && <ArrowDown size={12} className="text-[#034ea1]" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-12 text-center text-slate-400 text-xs">
                  Đang tải...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-12 text-center">
                  <p className="text-sm text-slate-500">{emptyTitle}</p>
                  {emptyAction && <div className="mt-3 flex justify-center">{emptyAction}</div>}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-4 py-3',
                        cell.column.columnDef.meta?.align === 'right' && 'text-right'
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalRows > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="tabular">
            {startRow}–{endRow} / {totalRows}
          </span>
          {table.getPageCount() > 1 && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft size={14} />
              </Button>
              <span className="px-1.5 tabular text-slate-700">{pageIndex + 1} / {table.getPageCount()}</span>
              <Button size="sm" variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    label?: string;
    align?: 'left' | 'right' | 'center';
  }
}
