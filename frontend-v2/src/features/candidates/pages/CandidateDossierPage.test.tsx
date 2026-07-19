import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { CandidateDossierPage } from '@/features/candidates/pages/CandidateDossierPage'
import { renderWithProviders } from '@/test/RenderWithProviders'
import { candidateDossierResponseFixture } from '@/test/fixtures/candidates'
import { server } from '@/test/msw/server'

const platformUrl = 'https://test.supabase.co/functions/v1/platform'
const candidateDetailRequestSchema = z
  .object({
    action: z.literal('candidate_detail'),
    candidate_id: z.string().min(1),
    tenant_ids: z.array(z.string()),
  })
  .strict()

describe('candidate dossier page', () => {
  it('loads the grounded profile and exposes timeline, skills, and evidence', async () => {
    server.use(
      http.post(platformUrl, async ({ request }) => {
        candidateDetailRequestSchema.parse(await request.json())
        return HttpResponse.json(candidateDossierResponseFixture)
      }),
    )

    renderWithProviders(<CandidateDossierPage />, {
      route: '/dossier/22222222-2222-4222-8222-222222222222',
      path: '/dossier/:candidateId',
    })

    expect(await screen.findByRole('heading', { name: 'Maya Hassan' })).toBeInTheDocument()
    expect(screen.getByText('Senior Platform Engineer')).toBeInTheDocument()
    expect(screen.getByText(/Maya builds reliable platforms/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('Acme Cloud')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }))
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }))
    expect(screen.getByText(/reliability roadmap for six product teams/)).toBeInTheDocument()
  })

  it('shows a clear not-found state for an absent candidate', async () => {
    server.use(
      http.post(platformUrl, () =>
        HttpResponse.json({ error: 'not_found', details: 'Candidate not found.' }, { status: 404 }),
      ),
    )

    renderWithProviders(<CandidateDossierPage />, {
      route: '/dossier/missing-candidate',
      path: '/dossier/:candidateId',
    })

    expect(await screen.findByRole('heading', { name: 'Candidate not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to candidates' })).toHaveAttribute(
      'href',
      '/candidates',
    )
  })
})
