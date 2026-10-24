import { useEffect, useState } from 'react';
import { FEEDBACK_NEW_DURATION_MS, feedbackStatusLabel } from '../model/feedbackStatus';

export const FeedbackStatus = ({ status, createdAt }: { status: string; createdAt: string }) => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (status.toLowerCase() !== 'new') return;
    const refresh = () => setNow(Date.now());
    const remaining = Date.parse(createdAt) + FEEDBACK_NEW_DURATION_MS - now;
    const timer = Number.isFinite(remaining) && remaining > 0 && remaining <= FEEDBACK_NEW_DURATION_MS
      ? window.setTimeout(refresh, remaining)
      : undefined;
    // Background tabs can throttle timers; refresh when the user returns.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [status, createdAt, now]);

  const label = feedbackStatusLabel(status, createdAt, now);
  return label ? <span className="ml-auto text-[11px] font-bold text-emerald-700">{label}</span> : null;
};
