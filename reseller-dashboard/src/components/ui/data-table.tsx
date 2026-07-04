import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
  headClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string | number;
  empty?: React.ReactNode;
  caption?: React.ReactNode;
}

// TODO Phase 5: mobile card layout
export function DataTable<T>({ columns, rows, getRowKey, empty, caption }: DataTableProps<T>) {
  return (
    <Table>
      {caption && <caption className="mb-2 text-sm text-muted-foreground">{caption}</caption>}
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className={col.headClassName}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
              {empty ?? "No data"}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, i) => (
            <TableRow key={getRowKey(row, i)}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
