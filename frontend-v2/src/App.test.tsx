import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the sample button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /hello, frontend-v2/i })).toBeInTheDocument()
  })
})
