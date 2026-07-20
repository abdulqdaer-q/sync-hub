import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchOriginalDocumentUrl } from '@/features/candidates/api/candidatesApi'
import {
  addShortlistItem,
  clearShortlist,
  fetchShortlist,
  removeShortlistItem,
} from '@/features/search/api/shortlistApi'
import {
  shortlistItemSchema,
  type ShortlistAddCommand,
  type ShortlistItem,
  type ShortlistRemoveCommand,
} from '@/features/search/types'
import { shortlistItemKey } from '@/features/search/shortlistIdentity'
import { useTenantScope } from '@/lib/auth/useTenantScope'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

function shortlistKey(scopeKey: string) {
  return [scopeKey, 'shortlist']
}

function optimisticShortlistItem(command: ShortlistAddCommand): ShortlistItem {
  const timestamp = new Date().toISOString()
  return shortlistItemSchema.parse({
    tenantId: command.candidate.tenantId,
    candidateId: command.candidate.candidateId,
    candidateName: command.candidate.name,
    currentTitle: command.candidate.currentTitle,
    location: command.candidate.location,
    yearsExperience: command.candidate.yearsExperience,
    seniority: command.candidate.seniority,
    primaryRole: command.candidate.primaryRole,
    topSkills: command.candidate.topSkills,
    matchRate: command.candidate.matchRate,
    cvUrl: null,
    originalFilename: null,
    sourceQuery: command.sourceQuery,
    searchSnapshot: {
      summary: command.candidate.summary,
      matchSignals: command.candidate.matchSignals,
    },
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export function useShortlistResource() {
  const scope = useTenantScope()
  const queryClient = useQueryClient()
  const queryKey = shortlistKey(scope.scopeKey)
  const query = useQuery({
    queryKey,
    queryFn: () => fetchShortlist(scope.resolvedTenantIds),
    staleTime: 60 * 1_000,
  })

  const add = useMutation({
    mutationKey: [scope.scopeKey, 'shortlist', 'add'],
    mutationFn: (command: ShortlistAddCommand) =>
      addShortlistItem(command.candidate, command.sourceQuery),
    onMutate: async (command) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ShortlistItem[]>(queryKey)
      const optimistic = optimisticShortlistItem(command)
      queryClient.setQueryData<ShortlistItem[]>(queryKey, (current = []) => [
        optimistic,
        ...current.filter((item) => shortlistItemKey(item) !== shortlistItemKey(optimistic)),
      ])
      return { previous }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<ShortlistItem[]>(queryKey, (current = []) => [
        saved,
        ...current.filter((item) => shortlistItemKey(item) !== shortlistItemKey(saved)),
      ])
    },
    onError: (error, _command, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(getUserErrorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationKey: [scope.scopeKey, 'shortlist', 'remove'],
    mutationFn: (command: ShortlistRemoveCommand) =>
      removeShortlistItem(command.tenantId, command.candidateId),
    onMutate: async (command) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ShortlistItem[]>(queryKey)
      queryClient.setQueryData<ShortlistItem[]>(queryKey, (current = []) =>
        current.filter((item) => shortlistItemKey(item) !== shortlistItemKey(command)),
      )
      return { previous }
    },
    onError: (error, _command, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(getUserErrorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const clear = useMutation({
    mutationKey: [scope.scopeKey, 'shortlist', 'clear'],
    mutationFn: () => clearShortlist(scope.resolvedTenantIds),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ShortlistItem[]>(queryKey)
      queryClient.setQueryData<ShortlistItem[]>(queryKey, [])
      return { previous }
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
      toast.error(getUserErrorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const openDocument = useMutation({
    mutationKey: [scope.scopeKey, 'shortlist', 'original-document'],
    mutationFn: (command: ShortlistRemoveCommand) =>
      fetchOriginalDocumentUrl([command.tenantId], command.candidateId),
    onError: (error) => toast.error(getUserErrorMessage(error)),
  })

  return { query, add, remove, clear, openDocument, scope }
}
