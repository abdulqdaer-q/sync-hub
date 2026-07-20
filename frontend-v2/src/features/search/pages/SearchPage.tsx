import { useMemo, useState } from 'react'
import { BookmarkCheck, Download, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import {
  useSearchFilterOptionsQuery,
  useSearchResultsQuery,
} from '@/features/search/api/useSearchApi'
import { useShortlistResource } from '@/features/search/api/useShortlistApi'
import { CandidatePreviewDialog } from '@/features/search/components/CandidatePreviewDialog'
import { SearchFilters } from '@/features/search/components/SearchFilters'
import { SearchResultsTable } from '@/features/search/components/SearchResultsTable'
import { ShortlistDrawer } from '@/features/search/components/ShortlistDrawer'
import { ShortlistTray } from '@/features/search/components/ShortlistTray'
import { downloadCsv, downloadShortlistCsv } from '@/features/search/downloadCsv'
import { useSearchParams } from '@/features/search/hooks/useSearchParams'
import { shortlistItemKey } from '@/features/search/shortlistIdentity'
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
  const shortlist = useShortlistResource()
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const [shortlistOpen, setShortlistOpen] = useState(false)
  const shortlistItems = useMemo(() => shortlist.query.data ?? [], [shortlist.query.data])
  const shortlistKeys = useMemo(
    () => new Set(shortlistItems.map(shortlistItemKey)),
    [shortlistItems],
  )
  const shortlistCandidateIds = useMemo(
    () => shortlistItems.map((item) => item.candidateId).slice(0, 8),
    [shortlistItems],
  )
  const shortlistCompareHref = useMemo(() => {
    if (shortlistCandidateIds.length < 2) return null
    return `/compare?${new URLSearchParams({ ids: shortlistCandidateIds.join(',') })}`
  }, [shortlistCandidateIds])
  const shortlistChatHref = useMemo(() => {
    if (!shortlistCandidateIds.length) return null
    return `/chat?${new URLSearchParams({
      ids: shortlistCandidateIds.join(','),
      q: 'Which candidate in my shortlist is the strongest fit and why?',
    })}`
  }, [shortlistCandidateIds])
  const pendingShortlistKeys = useMemo(() => {
    const keys = new Set<string>()
    if (shortlist.add.isPending && shortlist.add.variables) {
      keys.add(shortlistItemKey(shortlist.add.variables.candidate))
    }
    if (shortlist.remove.isPending && shortlist.remove.variables) {
      keys.add(shortlistItemKey(shortlist.remove.variables))
    }
    return keys
  }, [
    shortlist.add.isPending,
    shortlist.add.variables,
    shortlist.remove.isPending,
    shortlist.remove.variables,
  ])
  const hasCriteria = Boolean(
    params.query || params.skills.length || params.location || params.seniority || params.company,
  )

  async function openShortlistDocument(item: (typeof shortlistItems)[number]) {
    const target = window.open('about:blank', '_blank')
    if (target) target.opener = null
    try {
      const url = await shortlist.openDocument.mutateAsync({
        tenantId: item.tenantId,
        candidateId: item.candidateId,
      })
      if (target) target.location.replace(url)
      else window.location.assign(url)
    } catch {
      target?.close()
    }
  }

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Discovery"
        title="Talent search"
        description="Search structured candidate profiles using roles, skills, companies, experience, and grounded evidence."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setShortlistOpen(true)}>
              <BookmarkCheck aria-hidden="true" /> Shortlist ({shortlistItems.length})
            </Button>
            {searchQuery.data?.results.length ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadCsv(searchQuery.data.results)}
              >
                <Download aria-hidden="true" /> Export CSV
              </Button>
            ) : null}
          </>
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

      {shortlist.query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load the shortlist</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{getUserErrorMessage(shortlist.query.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void shortlist.query.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Try loading the shortlist again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ShortlistTray
        count={shortlistItems.length}
        isClearing={shortlist.clear.isPending}
        onClear={() => shortlist.clear.mutate()}
        onExport={() => downloadShortlistCsv(shortlistItems)}
        onOpen={() => setShortlistOpen(true)}
      />

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
          onToggleShortlist={(candidate) => {
            const key = shortlistItemKey(candidate)
            if (shortlistKeys.has(key)) {
              shortlist.remove.mutate({
                tenantId: candidate.tenantId,
                candidateId: candidate.candidateId,
              })
            } else {
              shortlist.add.mutate({ candidate, sourceQuery: params.query })
            }
          }}
          shortlistKeys={shortlistKeys}
          pendingShortlistKeys={pendingShortlistKeys}
        />
      ) : null}

      <CandidatePreviewDialog candidate={preview} onClose={() => setPreview(null)} />
      <ShortlistDrawer
        chatHref={shortlistChatHref}
        compareHref={shortlistCompareHref}
        isOpen={shortlistOpen}
        isPending={shortlist.query.isPending}
        isClearing={shortlist.clear.isPending}
        items={shortlistItems}
        pendingRemove={shortlist.remove.isPending ? shortlist.remove.variables : undefined}
        pendingDocument={
          shortlist.openDocument.isPending ? shortlist.openDocument.variables : undefined
        }
        onClear={() => shortlist.clear.mutate()}
        onExport={() => downloadShortlistCsv(shortlistItems)}
        onOpenDocument={(item) => void openShortlistDocument(item)}
        onOpenChange={setShortlistOpen}
        onRemove={(item) =>
          shortlist.remove.mutate({ tenantId: item.tenantId, candidateId: item.candidateId })
        }
      />
    </div>
  )
}
