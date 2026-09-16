'use client';
import { useEffect, useState } from 'react';
import type { HistoryResponse } from '@/lib/market-history';

export function useMarketHistory(symbol: string, enabled: boolean) {
  const [state, setState] = useState<HistoryResponse & { symbol: string }>({
    symbol: '',
    history: null,
    pending: false,
    error: null,
  });
  useEffect(() => {
    if (!enabled || !symbol) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let requestedAt = 0;
    const poll = async () => {
      let pending = false;
      try {
        const queue = Date.now() - requestedAt > 60000;
        const response = await fetch(
          queue
            ? '/api/market-history'
            : `/api/market-history?symbol=${encodeURIComponent(symbol)}`,
          {
            method: queue ? 'POST' : 'GET',
            ...(queue
              ? {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol }),
                }
              : {}),
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? 'Sign in to load stock history.'
              : 'Stock history is temporarily unavailable.',
          );
        const value = (await response.json()) as HistoryResponse;
        if (controller.signal.aborted) return;
        if (queue) requestedAt = Date.now();
        pending = value.pending;
        setState({ ...value, symbol });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((old) => ({
          symbol,
          history: old.symbol === symbol ? old.history : null,
          pending: false,
          error:
            error instanceof Error
              ? error.message
              : 'Stock history is unavailable.',
        }));
      }
      if (!controller.signal.aborted)
        timer = setTimeout(poll, pending ? 5000 : 30000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbol, enabled]);
  return state.symbol === symbol
    ? state
    : { history: null, pending: enabled && Boolean(symbol), error: null };
}
