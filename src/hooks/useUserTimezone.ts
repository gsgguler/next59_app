import { useState, useEffect } from 'react';

export function useUserTimezone(serverFallback?: string): string {
  const [timezone, setTimezone] = useState<string>(() => {
    if (typeof window === 'undefined' || !window.Intl) {
      return serverFallback || 'UTC';
    }
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return serverFallback || 'UTC';
    }
  });

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== timezone) setTimezone(tz);
    } catch {
      /* keep current */
    }
  }, [timezone]);

  return timezone;
}
