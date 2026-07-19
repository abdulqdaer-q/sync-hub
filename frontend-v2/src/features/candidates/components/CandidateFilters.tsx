import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { CandidateListParams, CandidateListResponse } from '@/features/candidates/types'

interface CandidateFiltersProps {
  params: CandidateListParams
  options?: CandidateListResponse['filterOptions']
  onChange: (patch: Partial<CandidateListParams>) => void
  onClear: () => void
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function CandidateFilters({ params, options, onChange, onClear }: CandidateFiltersProps) {
  const hasFilters = Boolean(
    params.query ||
    params.status ||
    params.role ||
    params.source ||
    params.location ||
    params.updatedFrom ||
    params.updatedTo,
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Filters</CardTitle>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X aria-hidden="true" /> Clear filters
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative md:col-span-2" htmlFor="candidate-search">
          <span className="sr-only">Search candidates by name or email</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            id="candidate-search"
            className="pl-8"
            value={params.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Search name or email"
          />
        </label>

        <label>
          <span className="sr-only">Filter by status</span>
          <select
            className={selectClassName}
            value={params.status}
            onChange={(event) => onChange({ status: event.target.value })}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {(options?.statuses ?? []).map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by role</span>
          <select
            className={selectClassName}
            value={params.role}
            onChange={(event) => onChange({ role: event.target.value })}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {(options?.roles ?? []).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by source</span>
          <select
            className={selectClassName}
            value={params.source}
            onChange={(event) => onChange({ source: event.target.value })}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {(options?.sources ?? []).map((source) => (
              <option key={source} value={source}>
                {titleCase(source)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by location</span>
          <select
            className={selectClassName}
            value={params.location}
            onChange={(event) => onChange({ location: event.target.value })}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {(options?.locations ?? []).map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Group candidates by</span>
          <select
            className={selectClassName}
            value={params.groupBy}
            onChange={(event) =>
              onChange({
                groupBy:
                  event.target.value === 'status' ||
                  event.target.value === 'role' ||
                  event.target.value === 'source' ||
                  event.target.value === 'location'
                    ? event.target.value
                    : '',
              })
            }
            aria-label="Group candidates by"
          >
            <option value="">No grouping</option>
            <option value="status">Group by status</option>
            <option value="role">Group by role</option>
            <option value="source">Group by source</option>
            <option value="location">Group by location</option>
          </select>
        </label>

        <label>
          <span className="sr-only">Sort candidates</span>
          <select
            className={selectClassName}
            value={`${params.sort}:${params.direction}`}
            onChange={(event) => {
              const [sort, direction] = event.target.value.split(':')
              if (
                (sort === 'updatedAt' || sort === 'name') &&
                (direction === 'asc' || direction === 'desc')
              ) {
                onChange({ sort, direction })
              }
            }}
            aria-label="Sort candidates"
          >
            <option value="updatedAt:desc">Recently updated</option>
            <option value="updatedAt:asc">Oldest updated</option>
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
          </select>
        </label>
      </CardContent>
    </Card>
  )
}
