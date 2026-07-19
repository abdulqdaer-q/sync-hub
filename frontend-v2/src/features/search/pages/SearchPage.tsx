import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import {
  useSearchFilterOptionsQuery,
  useSearchResultsQuery,
} from '@/features/search/api/useSearchApi'
import { CandidatePreviewDialog } from '@/features/search/components/CandidatePreviewDialog'
import { SearchFilters } from '@/features/search/components/SearchFilters'
import { SearchResultsTable } from '@/features/search/components/SearchResultsTable'
import { downloadCsv } from '@/features/search/downloadCsv'
import { useSearchParams } from '@/features/search/hooks/useSearchParams'
import type { SearchResult } from '@/features/search/types'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

function SearchResultsSkeleton() {
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-card p-4"
      aria-label="Searching candidates"
    >
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}

export function SearchPage() {
  const { params, updateParams, clearFilters } = useSearchParams()
  const searchQuery = useSearchResultsQuery(params)
  const filterQuery = useSearchFilterOptionsQuery()
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const hasCriteria = Boolean(
    params.query || params.skills.length || params.location || params.seniority || params.company,
  )

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Discovery"
        title="Talent search"
        description="Search structured candidate profiles using roles, skills, companies, experience, and grounded evidence."
        actions={
          searchQuery.data?.results.length ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadCsv(searchQuery.data.results)}
            >
              <Download aria-hidden="true" /> Export CSV
            </Button>
          ) : undefined
        }
      />

      <SearchFilters
        key={params.query}
        params={params}
        options={filterQuery.data}
        onChange={updateParams}
        onClear={clearFilters}
      />

      {filterQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load search filters</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{getUserErrorMessage(filterQuery.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void filterQuery.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Try loading filters again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasCriteria ? (
        <EmptyState
          title="Start with the talent you need"
          detail="Enter a role, skill, company, or location to search the candidate pool."
        />
      ) : null}
      {hasCriteria && searchQuery.isPending ? <SearchResultsSkeleton /> : null}
      {hasCriteria && searchQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to search candidates</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{getUserErrorMessage(searchQuery.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void searchQuery.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {searchQuery.data && searchQuery.data.results.length === 0 ? (
        <EmptyState
          title="No candidates match your search"
          detail="Try broadening or clearing the current search and filters."
          action={
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : null}
      {searchQuery.data && searchQuery.data.results.length > 0 ? (
        <SearchResultsTable
          response={searchQuery.data}
          params={params}
          isFetching={searchQuery.isFetching}
          onChange={updateParams}
          onPreview={setPreview}
        />
      ) : null}

      <CandidatePreviewDialog candidate={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
