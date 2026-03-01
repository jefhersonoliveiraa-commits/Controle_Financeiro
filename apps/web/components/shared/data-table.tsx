"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type VisibilityState,
  useReactTable
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils/cn";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

type DataTableProps<TData> = {
  data: TData[];
  columns: Array<ColumnDef<TData, any>>;
  searchPlaceholder?: string;
  showGlobalFilter?: boolean;
  showColumnToggle?: boolean;
  emptyMessage?: string;
};

export function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = "Buscar...",
  showGlobalFilter = true,
  showColumnToggle = true,
  emptyMessage = "Nenhum registro encontrado."
}: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      columnVisibility: visibility
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const columnList = useMemo(
    () => table.getAllLeafColumns().filter((column) => column.getCanHide()),
    [table]
  );

  useEffect(() => {
    if (!showColumnsMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowColumnsMenu(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showColumnsMenu]);

  return (
    <Card className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {showGlobalFilter ? (
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full sm:max-w-sm"
          />
        ) : null}

        {showColumnToggle ? (
          <div ref={menuRef} className="relative sm:ml-auto">
            <Button variant="secondary" size="sm" onClick={() => setShowColumnsMenu((prev) => !prev)}>
              <Columns3 size={16} className="mr-1" />
              Colunas
            </Button>
            {showColumnsMenu ? (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-surface-elevated p-2 shadow-panel">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Exibir colunas
                </p>
                <div className="space-y-1">
                  {columnList.map((column) => (
                    <label
                      key={column.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-soft"
                    >
                      <input
                        type="checkbox"
                        checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                      />
                      <span>{typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="text-xs text-muted">
        {table.getFilteredRowModel().rows.length} registros exibidos de {data.length}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm md:min-w-[900px]">
          <thead className="sticky top-0 z-[1] border-b border-border bg-surface-soft text-left">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th key={header.id} className="px-3 py-2 font-semibold">
                      {header.isPlaceholder ? null : (
                        <button
                          className="inline-flex items-center gap-1"
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? (
                            sorted === "asc" ? (
                              <ChevronUp size={14} />
                            ) : sorted === "desc" ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronsUpDown size={14} className="text-muted" />
                            )
                          ) : null}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/70 transition hover:bg-surface-soft/70",
                    rowIndex % 2 === 0 ? "bg-surface/20" : ""
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Próxima
          </Button>
        </div>
      </div>
    </Card>
  );
}
