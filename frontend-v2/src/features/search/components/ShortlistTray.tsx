import { BookmarkCheck, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ClearShortlistButton } from '@/features/search/components/ClearShortlistButton'

interface ShortlistTrayProps {
  count: number
  isClearing: boolean
  onClear: () => void
  onExport: () => void
  onOpen: () => void
}

export function ShortlistTray({
  count,
  isClearing,
  onClear,
  onExport,
  onOpen,
}: ShortlistTrayProps) {
  if (count === 0) return null

  return (
    <Card className="sticky top-4 flex-col items-stretch justify-between gap-3 border-primary/20 bg-card px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <BookmarkCheck aria-hidden="true" className="size-4" />
        </span>
        <div>
          <strong className="font-medium">{count} shortlisted</strong>
          <p className="text-xs text-muted-foreground">Saved to your account for this scope.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onOpen}>
          <BookmarkCheck aria-hidden="true" /> Review
        </Button>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download aria-hidden="true" /> Export CSV
        </Button>
        <ClearShortlistButton count={count} isPending={isClearing} onConfirm={onClear} />
      </div>
    </Card>
  )
}
