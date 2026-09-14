export type Transfer = {
  id: string;
  at: string;
  source: string;
  alias: string;
  fresh: string;
  token: string;
  amount: number;
  hop: number;
};
export type Cohort = {
  members: string[];
  runs: number;
  hitRate: number;
  medianReturn: number;
  history: { token: string; age: string; result: number; peak: number }[];
};
export type Hunter = {
  address: string;
  alias: string;
  winRate: number;
  pnl: number;
};
export type Signal = {
  id: string;
  at: string;
  token: string;
  name: string;
  status: string;
  score: number;
  cohortSize: number;
  wallets: string[];
  fundingPaths: string[];
  memory: Omit<Cohort, 'members'> & { matched: number };
  evidence: string[];
};
export type SwarmSnapshot = {
  meta: { mode: string; seed: number; tick: number; disclaimer: string };
  pulse: {
    watchedWallets: number;
    freshAddresses: number;
    activeCohort: number;
    neuronMotifs: number;
    planPnl: number;
  };
  config: { enabled: boolean; minScore: number; maxPosition: number };
  focusToken: { symbol: string; name: string; liquidity: number } | null;
  hunters: Hunter[];
  transfers: Transfer[];
  signals: Signal[];
  positions: {
    id: string;
    token: string;
    entry: number;
    mark: number;
    size: number;
    pnl: number;
    open: boolean;
    signalId: string;
  }[];
  network: {
    nodes: { id: string; label: string; type: string; strength: number }[];
    edges: { from: string; to: string; pulse: boolean }[];
  };
  memory: Cohort[];
};
export type Token = {
  address: string;
  symbol: string;
  name: string;
  protocol?: string;
  phase?: string;
  priceUsd?: string | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
  priceChange24h?: number | null;
  deployer?: string;
  blockNumber?: number;
  explorerUrl: string;
  dexUrl?: string;
  blocksAgo?: number;
};
export type TokenResult = {
  mode: string;
  source: string;
  updatedAt: string;
  error?: string | null;
  items: Token[];
};
export type Holder = {
  address: string;
  balanceRaw: string;
  balance: number;
  percentage: number;
  nonce: number;
  kind: string;
  accountType: string;
  explorerUrl: string;
};
export type HolderResult = {
  mode: string;
  source: string;
  coverage: string;
  heuristic: string;
  items: Holder[];
};
