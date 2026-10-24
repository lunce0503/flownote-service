export const FEEDBACK_NEW_DURATION_MS = 24 * 60 * 60 * 1000;

/** Presentation only: never changes the server's processing status. */
export const feedbackStatusLabel = (status: string, createdAt: string, now: number): string => {
  if (status.toLowerCase() !== 'new') return status;
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= 0 && age < FEEDBACK_NEW_DURATION_MS ? status : '';
};
