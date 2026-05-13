type ErrorWithDetails = {
  details?: unknown;
  message?: unknown;
};

type ValidationDetail = {
  message?: unknown;
};

export function getErrorMessage(error: unknown): string {
  const validationMessage = getValidationErrorMessage(error);

  if (validationMessage) {
    return validationMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getValidationErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const details = (error as ErrorWithDetails).details;
  if (!Array.isArray(details)) {
    return null;
  }

  const messages: string[] = [];

  for (const detail of details) {
    if (!detail || typeof detail !== 'object') {
      continue;
    }

    const message = (detail as ValidationDetail).message;
    if (typeof message === 'string' && message.trim()) {
      messages.push(message);
    }
  }

  if (messages.length === 0) {
    return null;
  }

  return messages.join(' | ');
}
