export type LearningReport = {
  status: string;
  eligible: boolean;
  mode: 'original' | 'learned' | 'shadow';
  updated_at?: string;
  version?: string;
  candidate_id?: string;
  active_candidate?: string;
  counts?: Record<string, number>;
  training_count?: number;
  heldout_count?: number;
  heldout_days?: number;
  heldout_symbols?: number;
  cutoff?: string;
  update_count?: number;
  cost_bps?: number;
  stress_bps?: number;
  horizon_minutes?: number;
  metrics?: Record<
    string,
    {
      count: number;
      mean_bps: number;
      win_rate: number;
      total_hypothetical_usd: number;
    }
  >;
  stress?: { mean_bps: number };
  signals?: Record<string, number>;
  curve?: {
    at: string;
    symbol: string;
    prediction_bps: number;
    action: string;
    outcome_bps: number;
    learner: number;
    original: number;
    always_long: number;
  }[];
  updates?: {
    at: string;
    symbol: string;
    fly: string;
    prediction_before_bps: number;
    prediction_after_bps: number;
    prediction_error_bps: number;
    reward_bps: number;
    weight_norm: number;
    decision_prediction_bps: number;
  }[];
  memory?: {
    fly: string;
    updates: number;
    fast_strength: number;
    slow_strength: number;
  }[];
  requirements?: { label: string; passed: boolean; value?: number }[];
  biology?: string;
  scope?: string;
};
