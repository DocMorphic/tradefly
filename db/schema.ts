import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
export const marketHistory = sqliteTable(
  'market_history',
  {
    symbol: text('symbol').primaryKey(),
    payload: text('payload'),
    requestedAt: integer('requested_at').notNull(),
    attemptedAt: integer('attempted_at').notNull().default(0),
    fetchedAt: integer('fetched_at'),
    error: text('error'),
  },
  (t) => [index('idx_market_history_requested').on(t.requestedAt)],
);
export const backendState = sqliteTable('backend_state', {
  id: integer('id').primaryKey(),
  snapshot: text('snapshot'),
  receivedAt: text('received_at'),
  command: text('command').notNull().default('pause'),
  commandId: text('command_id').notNull().default('initial'),
  commandAt: text('command_at'),
  commandPayload: text('command_payload'),
});
export const swarmResearch = sqliteTable('swarm_research', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  state: text('state').notNull(),
  updatedAt: text('updated_at').notNull(),
});
