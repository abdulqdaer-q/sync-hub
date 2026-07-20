import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useShortlistResource } from '@/features/search/api/useShortlistApi'
import type { SearchResult } from '@/features/search/types'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { shortlistItemFixture } from '@/test/fixtures/shortlist'
import { server } from '@/test/msw/server'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const saveItemRequestSchema = z
  .object({
    tenant_id: z.string(),
    candidate_id: z.string(),
    candidate_name: z.string(),
    current_title: z.string(),
    location: z.string(),
    years_experience: z.number(),
    seniority: z.string(),
    primary_role: z.string(),
    top_skills: z.array(z.string()),
    match_rate: z.number(),
    cv_url: z.null(),
    original_filename: z.null(),
    source_query: z.string(),
    search_snapshot: z
      .object({
        summary: z.string(),
        matchSignals: z
          .object({ semantic: z.number(), skill: z.number(), experience: z.number() })
          .strict(),
      })
      .strict(),
    notes: z.literal(''),
  })
  .strict()
const shortlistRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shortlist_items'), tenant_ids: z.array(z.string()) }).strict(),
  z.object({ action: z.literal('save_shortlist_item'), item: saveItemRequestSchema }).strict(),
  z
    .object({
      action: z.literal('delete_shortlist_item'),
      tenant_id: z.string(),
      candidate_id: z.string(),
    })
    .strict(),
])
const tenant = {
  id: shortlistItemFixture.tenant_id,
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter' as const,
  status: 'active' as const,
}
const auth = { memberships: [tenant], currentTenant: tenant }
const candidate = {
  tenantId: shortlistItemFixture.tenant_id,
  candidateId: shortlistItemFixture.candidate_id,
  name: shortlistItemFixture.candidate_name,
  currentTitle: shortlistItemFixture.current_title,
  location: shortlistItemFixture.location,
  yearsExperience: 8,
  seniority: 'senior',
  primaryRole: 'platform engineer',
  matchRate: 91,
  scoreRaw: 0.82,
  topSkills: ['Kubernetes', 'Go'],
  matchSignals: { semantic: 0.91, skill: 0.88, experience: 0.86 },
  summary: 'Strong platform engineering match.',
} satisfies SearchResult

function ShortlistHarness() {
  const shortlist = useShortlistResource()
  const firstItem = shortlist.query.data?.[0]
  return (
    <section>
      <output aria-label="Shortlist count">{shortlist.query.data?.length ?? 0}</output>
      <button
        type="button"
        onClick={() => shortlist.add.mutate({ candidate, sourceQuery: 'platform engineer' })}
      >
        Add candidate
      </button>
      {firstItem ? (
        <button
          type="button"
          onClick={() =>
            shortlist.remove.mutate({
              tenantId: firstItem.tenantId,
              candidateId: firstItem.candidateId,
            })
          }
        >
          Remove candidate
        </button>
      ) : null}
    </section>
  )
}

describe('shortlist React Query resource', () => {
  it('adds optimistically and rolls the cache back when the request fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let rejectSave: () => void = () => undefined
    const saveGate = new Promise<void>((resolve) => {
      rejectSave = resolve
    })
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = shortlistRequestSchema.parse(await request.json())
        switch (body.action) {
          case 'shortlist_items':
            return HttpResponse.json([])
          case 'save_shortlist_item':
            await saveGate
            return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
          case 'delete_shortlist_item':
            return HttpResponse.json({ ok: true })
        }
      }),
    )

    renderWithProviders(<ShortlistHarness />, { auth })

    expect(await screen.findByLabelText('Shortlist count')).toHaveTextContent('0')
    await userEvent.click(screen.getByRole('button', { name: 'Add candidate' }))
    expect(screen.getByLabelText('Shortlist count')).toHaveTextContent('1')

    rejectSave()
    await waitFor(() => expect(screen.getByLabelText('Shortlist count')).toHaveTextContent('0'))
    expect(toast.error).toHaveBeenCalledWith('Something went wrong. Please try again.')
    errorSpy.mockRestore()
  })

  it('removes optimistically and rolls the cache back when the request fails', async () => {
    vi.mocked(toast.error).mockClear()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let rejectRemove: () => void = () => undefined
    const removeGate = new Promise<void>((resolve) => {
      rejectRemove = resolve
    })
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = shortlistRequestSchema.parse(await request.json())
        switch (body.action) {
          case 'shortlist_items':
            return HttpResponse.json([shortlistItemFixture])
          case 'save_shortlist_item':
            return HttpResponse.json(shortlistItemFixture)
          case 'delete_shortlist_item':
            await removeGate
            return HttpResponse.json({ error: 'database unavailable' }, { status: 500 })
        }
      }),
    )

    renderWithProviders(<ShortlistHarness />, { auth })

    await waitFor(() => expect(screen.getByLabelText('Shortlist count')).toHaveTextContent('1'))
    await userEvent.click(screen.getByRole('button', { name: 'Remove candidate' }))
    expect(screen.getByLabelText('Shortlist count')).toHaveTextContent('0')

    rejectRemove()
    await waitFor(() => expect(screen.getByLabelText('Shortlist count')).toHaveTextContent('1'))
    expect(toast.error).toHaveBeenCalledWith('Something went wrong. Please try again.')
    errorSpy.mockRestore()
  })
})
