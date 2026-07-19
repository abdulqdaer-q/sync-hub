import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SearchResult } from '@/features/search/types'

interface CandidatePreviewDialogProps {
  candidate: SearchResult | null
  onClose: () => void
}

export function CandidatePreviewDialog({ candidate, onClose }: CandidatePreviewDialogProps) {
  return (
    <Dialog open={Boolean(candidate)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {candidate ? (
          <>
            <DialogHeader>
              <DialogTitle>{candidate.name}</DialogTitle>
              <DialogDescription>
                {[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{candidate.matchRate}% match</Badge>
                {candidate.seniority ? (
                  <Badge variant="secondary">{candidate.seniority}</Badge>
                ) : null}
                {candidate.yearsExperience ? (
                  <Badge variant="outline">{candidate.yearsExperience} years</Badge>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {candidate.summary || 'No search summary is available.'}
              </p>
              <section>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Matching skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills.length ? (
                    candidate.topSkills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No matching skills reported.
                    </span>
                  )}
                </div>
              </section>
            </div>
            <DialogFooter showCloseButton>
              <Button asChild>
                <Link to={`/dossier/${candidate.candidateId}`}>
                  View dossier <ExternalLink aria-hidden="true" />
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
