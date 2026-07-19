import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/features/search/hooks/useDebouncedValue'
import type { SearchFilterOptions, SearchParams } from '@/features/search/types'

interface SearchFiltersProps {
  params: SearchParams
  options?: SearchFilterOptions
  onChange: (patch: Partial<SearchParams>, resetPage?: boolean) => void
  onClear: () => void
}

function toOptions(values: string[]): ComboboxOption[] {
  return values.map((value) => ({ value, label: value }))
}

export function SearchFilters({ params, options, onChange, onClear }: SearchFiltersProps) {
  const [draftQuery, setDraftQuery] = useState(params.query)
  const debouncedQuery = useDebouncedValue(draftQuery, 300)

  useEffect(() => {
    if (debouncedQuery !== params.query) onChange({ query: debouncedQuery })
  }, [debouncedQuery, onChange, params.query])

  const skillOptions = useMemo(() => toOptions(options?.skills ?? []), [options?.skills])
  const locationOptions = useMemo(() => toOptions(options?.locations ?? []), [options?.locations])
  const seniorityOptions = useMemo(() => toOptions(options?.seniority ?? []), [options?.seniority])
  const companyOptions = useMemo(() => toOptions(options?.companies ?? []), [options?.companies])
  const hasFilters = Boolean(
    params.query || params.skills.length || params.location || params.seniority || params.company,
  )

  return (
    <Card className="py-0">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-5">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="talent-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              id="talent-search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              className="pl-8"
              placeholder="Role, skill, company, or experience"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Skills</Label>
          <Combobox
            multiple
            creatable
            ariaLabel="Skills"
            value={params.skills}
            options={skillOptions}
            placeholder="Add skills"
            onChange={(skills) => onChange({ skills })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Combobox
            ariaLabel="Location"
            value={params.location}
            options={locationOptions}
            placeholder="Any location"
            onChange={(location) => onChange({ location })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Seniority</Label>
          <Combobox
            ariaLabel="Seniority"
            value={params.seniority}
            options={seniorityOptions}
            placeholder="Any seniority"
            onChange={(seniority) => onChange({ seniority })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Company</Label>
          <Combobox
            ariaLabel="Company"
            value={params.company}
            options={companyOptions}
            placeholder="Any company"
            onChange={(company) => onChange({ company })}
          />
        </div>
        {hasFilters ? (
          <div className="flex items-end lg:col-start-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftQuery('')
                onClear()
              }}
            >
              <X aria-hidden="true" /> Clear filters
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
