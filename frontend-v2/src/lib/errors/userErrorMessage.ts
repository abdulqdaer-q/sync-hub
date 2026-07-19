import { isAuthError } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/client'

const genericErrorMessage = 'Something went wrong. Please try again.'

type ErrorLogger = (message: string, error: unknown) => void

const logUnexpectedError: ErrorLogger = (message, error) => {
  console.error(message, error)
}

export function getUserErrorMessage(
  error: unknown,
  logger: ErrorLogger = logUnexpectedError,
): string {
  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'The email or password is incorrect.'
      case 'email_not_confirmed':
        return 'Confirm your email address before signing in.'
      case 'weak_password':
        return 'Choose a stronger password and try again.'
      case 'same_password':
        return 'Choose a password you have not used for this account.'
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return 'Too many attempts. Please wait a moment and try again.'
      case 'session_not_found':
      case 'refresh_token_not_found':
        return 'Your session has expired. Please sign in again.'
    }

    logger('Unexpected authentication error', error)
    return 'We could not complete the authentication request. Please try again.'
  }

  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Your session has expired. Please sign in again.'
      case 403:
        return 'You do not have permission to do that.'
      case 404:
        return 'We could not find what you requested.'
      case 409:
        return 'That change conflicts with a newer update. Refresh and try again.'
      case 429:
        return 'Too many requests. Please wait a moment and try again.'
    }
  }

  logger('Unexpected application error', error)
  return genericErrorMessage
}
