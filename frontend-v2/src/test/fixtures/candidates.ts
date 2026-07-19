export const candidateListItemFixture = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  candidateId: '22222222-2222-4222-8222-222222222222',
  name: 'Mina Nabil',
  email: 'mina@example.com',
  location: 'Cairo, Egypt',
  primaryRole: 'Platform Engineer',
  appliedRole: 'Senior Platform Engineer',
  stage: 'Screening',
  stageKey: 'screening',
  source: 'career_site',
  seniority: 'Senior',
  updatedAt: '2026-07-20T01:00:00.000Z',
  groupKey: null,
  groupLabel: null,
}

export const candidateListResponseFixture = {
  items: [candidateListItemFixture],
  itemsTotalCount: 1,
  pageLimit: 25,
  pageOffset: 0,
  groupBy: null,
  groups: [],
  filterOptions: {
    statuses: ['screening'],
    roles: ['Senior Platform Engineer'],
    sources: ['career_site'],
    locations: ['Cairo, Egypt'],
  },
}
