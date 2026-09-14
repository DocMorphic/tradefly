export type PaperDecision = {
  id: string;
  created_at: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  bar: { t: string; o: number; h: number; l: number; c: number; v: number };
  feed: string;
  stimulus_hz: Record<string, number>;
  neural: {
    buy_hz: number;
    sell_hz: number;
    spikes: number;
    active_neurons: number;
    wall_seconds: number;
    neural_time_ms: number;
    state_id: string;
    manifest_hash: string;
    readout_ms: number;
    window_ms: number;
    output_neurons: Record<
      string,
      { id: string; spikes: number; hz: number }[]
    >;
  };
  account: Record<string, string | number | boolean | null>;
  position: Record<string, string>;
};
export type PaperOrder = {
  client_id: string;
  decision_id: string;
  status: string;
  payload: Record<string, string | boolean>;
  broker: Record<string, string | null> | null;
};
export type BackendSnapshot = {
  pilot_replay?: {
    source: string;
    date: string;
    scope: string;
    net_pnl: number;
    ending_equity: number;
    fees: number;
    initial_cash: number;
    frames: unknown[];
    fills: unknown[];
  };
  max_observed_drawdown_pct: number;
  equity_sample_count: number;
  equity_history: { at: string; equity: string; cash: string }[];
  schema: number;
  mode: 'alpaca-paper';
  last_command_id: string | null;
  updated_at: string;
  paused: boolean;
  message: string;
  broker: {
    connected: boolean;
    endpoint: string;
    credentials_configured: boolean;
  };
  brain: {
    ready: boolean;
    loaded: boolean;
    manifest: {
      dataset: string;
      neuron_count: number;
      neuron_pair_edges: number;
      synapse_count: number;
      inputs: Record<string, string[]>;
      input_types: Record<string, string>;
      outputs: Record<string, string[]>;
      excluded_input_ids: string[];
      mapping_note: string;
      upstream_commit: string;
      parameters: Record<string, number>;
    } | null;
    validation: {
      passed: boolean;
      peak_rss_gib: number;
      total_seconds: number;
      validation_kind: string;
      sugar: { buy_hz: number };
      jon: { sell_hz: number };
      ablated: { buy_hz: number; sell_hz: number };
    } | null;
  };
  account: Record<string, string | number | boolean | null>;
  positions: Record<string, string>[];
  market: {
    is_open: boolean;
    timestamp: string;
    next_open: string;
    next_close: string;
  };
  symbol: string;
  feed: string;
  latest_bar: PaperDecision['bar'] | null;
  limits: {
    max_order_usd: number;
    max_exposure_pct: number;
    long_only: boolean;
  };
  baseline: { equity: string; at: string } | null;
  equity_change_usd: number | null;
  blockers: string[];
  decisions: PaperDecision[];
  decision_count: number;
  orders: PaperOrder[];
  events: { id: number; at: string; kind: string; data: unknown }[];
  export_note: string;
};
export type BackendResponse = {
  snapshot: BackendSnapshot | null;
  received_at?: string;
  command?: string;
  command_id?: string;
};
