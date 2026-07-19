import { Building2, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { CandidateFilters } from '@/features/candidates/components/CandidateFilters'
import { CandidateListTable } from '@/features/candidates/components/CandidateListTable'
import { useCandidateListQuery } from '@/features/candidates/api/useCandidatesApi'
import { useCandidateListParams } from '@/features/candidates/hooks/useCandidateListParams'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

const selectClassName =
  'h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function CandidateListSkeleton() {
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-card p-4"
      aria-label="Loading candidates"
    >
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}

export function CandidatesPage() {
  const { params, updateParams, clearFilters } = useCandidateListParams()
  const query = useCandidateListQuery(params)
  const { scope } = query
  const hasFilters = Boolean(
    params.query || params.status || params.role || params.source || params.location,
  )

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Talent pool"
        title="Candidates"
        description="Browse, filter, and group structured candidate records across the company you are working in."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {scope.tenantOptions.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 aria-hidden="true" className="size-4" />
                <span className="sr-only">Company</span>
                <select
                  className={selectClassName}
                  value={scope.currentTenant?.id ?? ''}
                  onChange={(event) => scope.selectTenant(event.target.value)}
                  aria-label="Company"
                  disabled={scope.isAllScope}
                >
                  {scope.tenantOptions.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {scope.tenantOptions.length > 0 && scope.isPlatformAdmin ? (
              <select
                className={selectClassName}
                value={scope.scopeMode}
                onChange={(event) =>
                  scope.setScopeMode(event.target.value === 'all' ? 'all' : 'current')
                }
                aria-label="Company scope"
              >
                <option value="current">Current company</option>
                <option value="all">All companies</option>
              </select>
            ) : null}
          </div>
        }
      />

      <CandidateFilters
        params={params}
        options={query.data?.filterOptions}
        onChange={updateParams}
        onClear={clearFilters}
      />

      {query.isPending ? <CandidateListSkeleton /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load candidates</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{getUserErrorMessage(query.error)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {query.data && query.data.itemsTotalCount === 0 ? (
        <EmptyState
          title={hasFilters ? 'No candidates match your filters' : 'No candidates yet'}
          detail={
            hasFilters
              ? 'Try broadening or clearing the current filters.'
              : 'Candidates will appear here after CVs are added to this company.'
          }
          action={
            hasFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {query.data && query.data.itemsTotalCount > 0 ? (
        <CandidateListTable
          response={query.data}
          params={params}
          isFetching={query.isFetching}
          showTenant={scope.isAllScope}
          onChange={updateParams}
        />
      ) : null}
    </div>
  )
}
