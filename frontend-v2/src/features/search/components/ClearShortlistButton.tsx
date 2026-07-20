import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface ClearShortlistButtonProps {
  count: number
  isPending: boolean
  onConfirm: () => void
}

export function ClearShortlistButton({ count, isPending, onConfirm }: ClearShortlistButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={count === 0 || isPending}>
          <Trash2 aria-hidden="true" /> {isPending ? 'Clearing…' : 'Clear'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the saved shortlist?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes all {count} saved {count === 1 ? 'candidate' : 'candidates'} in the current
            company scope. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep shortlist</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Clear saved candidates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
