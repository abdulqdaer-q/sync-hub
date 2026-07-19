import { useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { CandidatesPage } from '@/features/candidates/pages/CandidatesPage'
import type { TenantMembership } from '@/lib/auth/api/authContext'
import type { AuthContextValue } from '@/lib/auth/authContextStore'
import { TestAuthProvider } from '@/test/TestAuthProvider'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'
import { createTestSession, createTestUser } from '@/test/createTestSession'
import { candidateListResponseFixture } from '@/test/fixtures/candidates'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { server } from '@/test/msw/server'

const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const candidateListRequestSchema = z
  .object({
    action: z.literal('candidates_list'),
    tenant_ids: z.array(z.string()),
    limit: z.number().int(),
    offset: z.number().int(),
    query: z.string().nullable(),
    status: z.string().nullable(),
    role: z.string().nullable(),
    source: z.string().nullable(),
    location: z.string().nullable(),
    updated_from: z.string().nullable(),
    updated_to: z.string().nullable(),
    group_by: z.string().nullable(),
  })
  .strict()

const tenantA: TenantMembership = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  name: 'Acme Recruiting',
  iconUrl: null,
  role: 'recruiter',
  status: 'active',
}
const tenantB: TenantMembership = {
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'globex',
  name: 'Globex',
  iconUrl: null,
  role: 'recruiter',
  status: 'active',
}
const auth = {
  session: createTestSession(),
  user: createTestUser(),
  memberships: [tenantA, tenantB],
  currentTenant: tenantA,
}

function LocationProbe() {
  return <output aria-label="Current query string">{useLocation().search}</output>
}

describe('candidates page', () => {
  it('loads candidates through MSW and the real query/adapter flow', async () => {
    server.use(
      http.post(platformUrl, async ({ request }) => {
        candidateListRequestSchema.parse(await request.json())
        return HttpResponse.json(candidateListResponseFixture)
      }),
    )

    renderWithProviders(<CandidatesPage />, { route: '/candidates', auth })

    expect(await screen.findByRole('link', { name: 'Mina Nabil' })).toBeInTheDocument()
    expect(screen.getAllByText('Senior Platform Engineer')).toHaveLength(2)
    expect(screen.getAllByText('Cairo, Egypt')).toHaveLength(2)
  })

  it('writes filter changes to the shareable URL', async () => {
    server.use(http.post(platformUrl, () => HttpResponse.json(candidateListResponseFixture)))

    renderWithProviders(
      <>
        <CandidatesPage />
        <LocationProbe />
      </>,
      { route: '/candidates', auth },
    )

    await screen.findByRole('link', { name: 'Mina Nabil' })
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'screening')

    await waitFor(() =>
      expect(screen.getByLabelText('Current query string')).toHaveTextContent('status=screening'),
    )
  })

  it('changes the scope-keyed query and refetches when the company changes', async () => {
    const requestedTenantIds: string[][] = []
    let releaseTenantB: () => void = () => undefined
    const tenantBGate = new Promise<void>((resolve) => {
      releaseTenantB = resolve
    })
    server.use(
      http.post(platformUrl, async ({ request }) => {
        const body = candidateListRequestSchema.parse(await request.json())
        requestedTenantIds.push(body.tenant_ids)
        if (body.tenant_ids[0] === tenantB.id) {
          await tenantBGate
          return HttpResponse.json({
            ...candidateListResponseFixture,
            items: [
              {
                ...candidateListResponseFixture.items[0],
                tenantId: tenantB.id,
                candidateId: '44444444-4444-4444-8444-444444444444',
                name: 'Globex Candidate',
                email: 'candidate@globex.example',
              },
            ],
          })
        }
        return HttpResponse.json(candidateListResponseFixture)
      }),
    )

    function ScopeHarness() {
      const [currentTenant, setCurrentTenant] = useState(tenantA)
      const authValue = useMemo<AuthContextValue>(
        () =>
          createTestAuthContextValue({
            ...auth,
            currentTenant,
            selectTenant: (tenantId) => {
              const selected = [tenantA, tenantB].find((tenant) => tenant.id === tenantId)
              if (selected) setCurrentTenant(selected)
            },
          }),
        [currentTenant],
      )

      return (
        <TestAuthProvider value={authValue}>
          <CandidatesPage />
        </TestAuthProvider>
      )
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { render } = await import('@testing-library/react')
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/candidates']}>
          <ScopeHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Mina Nabil' })).toBeInTheDocument()
    expect(requestedTenantIds).toEqual([[tenantA.id]])
    await userEvent.selectOptions(screen.getByLabelText('Company'), tenantB.id)
    await waitFor(() => expect(requestedTenantIds).toEqual([[tenantA.id], [tenantB.id]]))
    expect(screen.queryByRole('link', { name: 'Mina Nabil' })).not.toBeInTheDocument()

    releaseTenantB()
    expect(await screen.findByRole('link', { name: 'Globex Candidate' })).toBeInTheDocument()
  })

  it('shows a friendly error and retries malformed data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let attempts = 0
    server.use(
      http.post(platformUrl, () => {
        attempts += 1
        return HttpResponse.json(attempts === 1 ? { items: [] } : candidateListResponseFixture)
      }),
    )

    renderWithProviders(<CandidatesPage />, { route: '/candidates', auth })

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Mina Nabil' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})
