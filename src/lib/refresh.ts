
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration from the Vite environment.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Avoid crashing the entire React app when environment variables are missing.
const client =
  url && anonKey
    ? createClient(url, anonKey, {
        realtime: {
          params: {
            eventsPerSecond: 5,
          },
        },
      })
    : null;

export function useRefreshSignal(
  onRefresh: () => void,
  scope?: string,
): boolean {
  const [live, setLive] = useState(false);
  const cbRef = useRef(onRefresh);

  cbRef.current = onRefresh;

  useEffect(() => {
    if (!client) {
      setLive(false);
      return;
    }

    const supabase = client;
    const channel = supabase.channel('swasthya-live');

    channel
      .on(
        'broadcast',
        { event: 'refresh' },
        (msg: { payload?: { scope?: string } }) => {
          if (
            !scope ||
            !msg.payload?.scope ||
            msg.payload.scope === scope
          ) {
            cbRef.current();
          }
        },
      )
      .subscribe((status: string) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [scope]);

  return live;
}

// Polling fallback for environments where realtime is unavailable.
export function usePollFallback(
  onRefresh: () => void,
  ms = 15000,
): void {
  useEffect(() => {
    const interval = setInterval(onRefresh, ms);

    return () => {
      clearInterval(interval);
    };
  }, [onRefresh, ms]);
}
