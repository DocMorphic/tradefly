import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const backendState = sqliteTable('backend_state', {
  id: integer('id').primaryKey(),
  snapshot: text('snapshot'),
  receivedAt: text('received_at'),
  command: text('command').notNull().default('pause'),
  commandId: text('command_id').notNull().default('initial'),
  commandAt: text('command_at'),
});
