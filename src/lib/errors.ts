export type AppErrorCode =
  | 'offline'
  | 'cancelled'
  | 'not_signed_in'
  | 'forbidden'
  | 'mic_denied'
  | 'calendar_disconnected'
  | 'rate_limited'
  | 'no_speech'
  | 'too_large'
  | 'model_error'
  | 'server_error'
  | 'google_error'
  | 'config_error'
  | 'unknown';

/** Every failure the UI can explain carries one of these codes. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details: { canAskAgain?: boolean; status?: number } = {}
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof TypeError && /network|fetch/i.test(error.message)) {
    return new AppError('offline', "You're offline. Check your connection and try again.");
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AppError('unknown', message || 'Something went wrong.');
}

/** Short, user-facing explanation. */
export function describeError(error: AppError): string {
  switch (error.code) {
    case 'offline':
      // Keep the specific reason (timeout, which server) so failures can be told apart.
      return `${error.message} Your recording is kept, so you can try again.`;
    case 'mic_denied':
      return 'Microphone access is off. Turn it on in Settings to capture tasks by voice.';
    case 'calendar_disconnected':
      return 'Google Calendar access was lost. Reconnect to keep scheduling.';
    case 'rate_limited':
      return "You've hit today's capture limit. Try again tomorrow.";
    case 'no_speech':
      return "Didn't catch any speech. Try again a little closer to the mic.";
    case 'model_error':
      return "Couldn't turn that into tasks. Try again or rephrase.";
    case 'forbidden':
      return 'This Google account is not allowed to use Voice To-Do.';
    default:
      return error.message;
  }
}
