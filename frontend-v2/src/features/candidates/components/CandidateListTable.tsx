import { Fragment, useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  CandidateListItem,
  CandidateListParams,
  CandidateListResponse,
} from '@/features/candidates/types'

interface CandidateListTableProps {
  response: CandidateListResponse
  params: CandidateListParams
  isFetching: boolean
  showTenant: boolean
  onChange: (patch: Partial<CandidateListParams>, resetPage?: boolean) => void
}

const columnHelper = createColumnHelper<CandidateListItem>()

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
}

export function CandidateListTable({
  response,
  params,
  isFetching,
  showTenant,
  onChange,
}: CandidateListTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex min-w-48 flex-col gap-0.5">
            <Link
              className="font-medium text-foreground hover:text-primary"
              to={`/dossier/${row.original.candidateId}`}
            >
              {row.original.name}
            </Link>
            {row.original.email ? (
              <span className="text-xs text-muted-foreground">{row.original.email}</span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('stage', {
        header: 'Stage',
        cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
      }),
      columnHelper.accessor((row) => row.appliedRole ?? row.primaryRole, {
        id: 'role',
        header: 'Applied role',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('location', {
        header: 'Location',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('source', {
        header: 'Source',
        cell: (info) => <Badge variant="outline">{info.getValue().replaceAll('_', ' ')}</Badge>,
      }),
      ...(showTenant
        ? [
            columnHelper.accessor('tenantId', {
              header: 'Company',
              cell: (info) => info.getValue().slice(0, 8),
            }),
          ]
        : []),
      columnHelper.accessor('updatedAt', {
        header: 'Last updated',
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    [showTenant],
  )
  // TanStack Table intentionally returns callable table methods; React Compiler
  // cannot memoize this third-party hook, but the table owns no compiler state.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: response.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.tenantId}:${row.candidateId}`,
  })
  const totalPages = Math.max(1, Math.ceil(response.itemsTotalCount / params.pageSize))
  const start = response.itemsTotalCount === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const end = Math.min(response.itemsTotalCount, start + response.items.length - 1)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between border-b py-4">
        <div>
          <CardTitle>Candidate directory</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {isFetching ? 'Refreshing…' : `${response.itemsTotalCount.toLocaleString()} candidates`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Per page
          <select
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            value={params.pageSize}
            onChange={(event) => {
              const pageSize = Number.parseInt(event.target.value, 10)
              if (pageSize === 25 || pageSize === 50 || pageSize === 100) {
                onChange({ pageSize })
              }
            }}
            aria-label="Candidates per page"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="first:pl-4 last:pr-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, rowPosition, rows) => {
              const groupChanged =
                params.groupBy &&
                (rowPosition === 0 ||
                  rows[rowPosition - 1]?.original.groupKey !== row.original.groupKey)
              const group = response.groups.find((entry) => entry.key === row.original.groupKey)
              return (
                <Fragment key={row.id}>
                  {groupChanged ? (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={columns.length} className="px-4 py-2 font-medium">
                        {row.original.groupLabel ?? 'Other'}
                        <Badge variant="outline" className="ml-2">
                          {group?.count ?? 1}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="first:pl-4 last:pr-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {start}–{end} of {response.itemsTotalCount.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={params.page <= 1}
            onClick={() => onChange({ page: params.page - 1 }, false)}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <span>
            Page {params.page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={params.page >= totalPages}
            onClick={() => onChange({ page: params.page + 1 }, false)}
          >
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
