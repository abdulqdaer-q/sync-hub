import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { SearchPage } from '@/features/search/pages/SearchPage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { searchFilterOptionsFixture, searchResponseFixture } from '@/test/fixtures/search'
import { shortlistItemFixture } from '@/test/fixtures/shortlist'
import { server } from '@/test/msw/server'

const searchUrl = 'https://test.supabase.co/functions/v1/search'
const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const searchRequestSchema = z
  .object({
    q: z.string(),
    tenant_ids: z.array(z.string()),
    filters: z
      .object({
        skills: z.array(z.string()),
        location: z.string().nullable(),
        seniority: z.string().nullable(),
        companies: z.array(z.string()),
      })
      .strict(),
    limit: z.union([z.literal(20), z.literal(50)]),
    offset: z.number().int().nonnegative(),
    semantic: z.literal(true),
  })
  .strict()
const filterOptionsRequestSchema = z
  .object({
    action: z.literal('search_filter_options'),
    tenant_ids: z.array(z.string()),
  })
  .strict()
const shortlistListRequestSchema = z
  .object({
    action: z.literal('shortlist_items'),
    tenant_ids: z.array(z.string()),
  })
  .strict()
const shortlistSaveItemRequestSchema = z
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

const tenant = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter' as const,
  status: 'active' as const,
}
const auth = { memberships: [tenant], currentTenant: tenant }

function LocationProbe() {
  return <output aria-label="Current query string">{useLocation().search}</output>
}

function installFilterOptionsHandler() {
  server.use(
    http.post(platformUrl, async ({ request }) => {
      const body = z
        .discriminatedUnion('action', [filterOptionsRequestSchema, shortlistListRequestSchema])
        .parse(await request.json())
      return HttpResponse.json(body.action === 'shortlist_items' ? [] : searchFilterOptionsFixture)
    }),
  )
}

describe('search page', () => {
  it('loads results and sends every URL-backed filter through the real adapter', async () => {
    let requestBody: z.infer<typeof searchRequestSchema> | undefined
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, async ({ request }) => {
        requestBody = searchRequestSchema.parse(await request.json())
        return HttpResponse.json(searchResponseFixture)
      }),
    )

    renderWithProviders(<SearchPage />, {
      route:
        '/search?q=platform&skills=Kubernetes&location=Cairo%2C+Egypt&seniority=senior&company=Acme+Cloud',
      auth,
    })

    expect(await screen.findByRole('button', { name: 'Maya Hassan' })).toBeInTheDocument()
    expect(screen.getByText('1 candidate on this page')).toBeInTheDocument()
    expect(requestBody).toMatchObject({
      q: 'platform',
      tenant_ids: ['tenant-1'],
      filters: {
        skills: ['Kubernetes'],
        location: 'Cairo, Egypt',
        seniority: 'senior',
        companies: ['Acme Cloud'],
      },
    })
  })

  it('sorts the table and records the choice in the URL', async () => {
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () =>
        HttpResponse.json({
          ...searchResponseFixture,
          results: [
            searchResponseFixture.results[0],
            {
              ...searchResponseFixture.results[0],
              candidate_id: '33333333-3333-4333-8333-333333333333',
              name: 'Aaron Saleh',
              match_rate: 70,
            },
          ],
          next_cursor: null,
          meta: { ...searchResponseFixture.meta, count: 2 },
        }),
      ),
    )

    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=engineer', auth },
    )

    await screen.findByRole('button', { name: 'Maya Hassan' })
    await userEvent.click(screen.getByRole('button', { name: 'Candidate' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Current query string')).toHaveTextContent(
        'sort=name&direction=asc',
      ),
    )
    expect(
      screen
        .getAllByRole('button', { name: /^(Aaron Saleh|Maya Hassan)$/ })
        .map((button) => button.textContent),
    ).toEqual(['Aaron Saleh', 'Maya Hassan'])
  })

  it('reflects an applied filter in the shareable URL', async () => {
    installFilterOptionsHandler()
    server.use(http.post(searchUrl, () => HttpResponse.json(searchResponseFixture)))

    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=platform', auth },
    )

    await screen.findByRole('button', { name: 'Maya Hassan' })
    await userEvent.click(screen.getByRole('combobox', { name: 'Location' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Cairo, Egypt' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Current query string')).toHaveTextContent(
        'location=Cairo%2C+Egypt',
      ),
    )
  })

  it('shows the empty state for a successful search with no matches', async () => {
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () =>
        HttpResponse.json({
          ...searchResponseFixture,
          results: [],
          next_cursor: null,
          meta: { ...searchResponseFixture.meta, count: 0 },
        }),
      ),
    )

    renderWithProviders(<SearchPage />, { route: '/search?q=unfindable', auth })

    expect(await screen.findByText('No candidates match your search')).toBeInTheDocument()
  })

  it('shows a friendly malformed-data error and retries', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let attempts = 0
    installFilterOptionsHandler()
    server.use(
      http.post(searchUrl, () => {
        attempts += 1
        return HttpResponse.json(attempts === 1 ? { results: [] } : searchResponseFixture)
      }),
    )

    renderWithProviders(<SearchPage />, { route: '/search?q=platform', auth })

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Maya Hassan' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('adds and removes a search result with optimistic shortlist controls', async () => {
    let releaseSave: () => void = () => undefined
    let releaseRemove: () => void = () => undefined
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const removeGate = new Promise<void>((resolve) => {
      releaseRemove = resolve
    })
    let saved = false
    const shortlistFixture = {
      ...shortlistItemFixture,
      tenant_id: 'tenant-1',
      candidate_name: 'Maya Hassan',
      current_title: 'Senior Platform Engineer',
      years_experience: 9,
      primary_role: 'platform-engineering',
      top_skills: ['Kubernetes'],
      match_rate: 92,
      cv_url: null,
      original_filename: null,
    }
    const platformMutationRequestSchema = z.discriminatedUnion('action', [
      filterOptionsRequestSchema,
      shortlistListRequestSchema,
      z
        .object({
          action: z.literal('save_shortlist_item'),
          item: shortlistSaveItemRequestSchema.extend({ tenant_id: z.literal('tenant-1') }),
        })
        .strict(),
      z
        .object({
          action: z.literal('delete_shortlist_item'),
          tenant_id: z.literal('tenant-1'),
          candidate_id: z.string(),
        })
        .strict(),
    ])
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = platformMutationRequestSchema.parse(await request.json())
        switch (body.action) {
          case 'search_filter_options':
            return HttpResponse.json(searchFilterOptionsFixture)
          case 'shortlist_items':
            return HttpResponse.json(saved ? [shortlistFixture] : [])
          case 'save_shortlist_item':
            await saveGate
            saved = true
            return HttpResponse.json(shortlistFixture)
          case 'delete_shortlist_item':
            await removeGate
            saved = false
            return HttpResponse.json({ ok: true })
        }
      }),
      http.post(searchUrl, () => HttpResponse.json(searchResponseFixture)),
    )

    renderWithProviders(<SearchPage />, { route: '/search?q=platform', auth })

    await screen.findByRole('button', { name: 'Maya Hassan' })
    await userEvent.click(screen.getByRole('button', { name: 'Add Maya Hassan to shortlist' }))
    expect(screen.getByRole('button', { name: 'Remove Maya Hassan from shortlist' })).toBeDisabled()
    expect(screen.getByText('1 shortlisted')).toBeInTheDocument()

    releaseSave()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove Maya Hassan from shortlist' }),
      ).toBeEnabled(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove Maya Hassan from shortlist' }))
    expect(screen.getByRole('button', { name: 'Add Maya Hassan to shortlist' })).toBeDisabled()

    releaseRemove()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Maya Hassan to shortlist' })).toBeEnabled(),
    )
  })

  it('clears saved candidates only after AlertDialog confirmation', async () => {
    let clearRequests = 0
    let releaseClear: () => void = () => undefined
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve
    })
    let saved = true
    const shortlistFixture = {
      ...shortlistItemFixture,
      tenant_id: 'tenant-1',
      cv_url: null,
      original_filename: null,
    }
    const platformClearRequestSchema = z.discriminatedUnion('action', [
      filterOptionsRequestSchema,
      shortlistListRequestSchema,
      z
        .object({
          action: z.literal('clear_shortlist_items'),
          tenant_ids: z.array(z.literal('tenant-1')),
        })
        .strict(),
    ])
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = platformClearRequestSchema.parse(await request.json())
        switch (body.action) {
          case 'search_filter_options':
            return HttpResponse.json(searchFilterOptionsFixture)
          case 'shortlist_items':
            return HttpResponse.json(saved ? [shortlistFixture] : [])
          case 'clear_shortlist_items':
            clearRequests += 1
            await clearGate
            saved = false
            return HttpResponse.json({ ok: true })
        }
      }),
    )

    renderWithProviders(<SearchPage />, { route: '/search', auth })

    await screen.findByText('1 shortlisted')
    await userEvent.click(screen.getByRole('button', { name: 'Shortlist (1)' }))
    expect(await screen.findByRole('heading', { name: 'Saved shortlist' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(clearRequests).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Clear saved candidates' }))
    expect(clearRequests).toBe(1)
    expect(await screen.findByText('No candidates saved yet')).toBeInTheDocument()

    releaseClear()
    await waitFor(() => expect(screen.getByText('No candidates saved yet')).toBeInTheDocument())
  })

  it('keeps shortlist export and CV actions connected to the real document endpoint', async () => {
    const documentUrl = `${window.location.origin}/#maya-document`
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const documentRequestSchema = z.discriminatedUnion('action', [
      filterOptionsRequestSchema,
      shortlistListRequestSchema,
      z
        .object({
          action: z.literal('original_document_url'),
          candidate_id: z.literal(shortlistItemFixture.candidate_id),
          tenant_ids: z.array(z.literal('tenant-1')),
        })
        .strict(),
    ])
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = documentRequestSchema.parse(await request.json())
        switch (body.action) {
          case 'search_filter_options':
            return HttpResponse.json(searchFilterOptionsFixture)
          case 'shortlist_items':
            return HttpResponse.json([
              { ...shortlistItemFixture, tenant_id: 'tenant-1' },
              {
                ...shortlistItemFixture,
                tenant_id: 'tenant-1',
                candidate_id: 'candidate-2',
                candidate_name: 'Omar Saleh',
                cv_url: null,
                original_filename: null,
              },
            ])
          case 'original_document_url':
            return HttpResponse.json({
              url: documentUrl,
              source: 'gcs_signed_url',
              expires_at: '2026-07-20T10:00:00Z',
              original_filename: 'maya-hassan-cv.pdf',
            })
        }
      }),
    )

    renderWithProviders(<SearchPage />, { route: '/search', auth })

    await screen.findByText('2 shortlisted')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Shortlist (2)' }))
    expect(screen.getByRole('link', { name: 'Ask Agent' })).toHaveAttribute(
      'href',
      expect.stringContaining('/chat?'),
    )
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute(
      'href',
      '/compare?ids=22222222-2222-4222-8222-222222222222%2Ccandidate-2',
    )
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'CV' }))

    await waitFor(() => expect(window.location.hash).toBe('#maya-document'))
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    window.history.replaceState(null, '', '/')
    openSpy.mockRestore()
  })
})
