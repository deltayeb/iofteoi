import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, unique } from 'drizzle-orm/pg-core';

// Accounts (humans)
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  trustScore: integer('trust_score').default(100).notNull(),
  balanceCents: integer('balance_cents').default(0).notNull(),
  publisherBalanceCents: integer('publisher_balance_cents').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Agent tokens (for programmatic access)
export const agentTokens = pgTable('agent_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  tokenHash: text('token_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Protocols
export const protocols = pgTable('protocols', {
  id: uuid('id').primaryKey().defaultRandom(),
  publisherId: uuid('publisher_id').references(() => accounts.id).notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description').notNull(), // 7 words enforced at app level
  longDescription: text('long_description'),
  declaredKeywords: text('declared_keywords').array().default([]),
  earnedKeywords: text('earned_keywords').array().default([]),
  handlerUrl: text('handler_url').notNull(),
  pricePerInvocationCents: integer('price_per_invocation_cents').notNull(),
  status: text('status').default('ACTIVE').notNull(), // ACTIVE | DEPRECATED | SUSPENDED
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  deprecationReason: text('deprecation_reason'),
  sunsetDate: timestamp('sunset_date', { withTimezone: true }),
  invocationCount: integer('invocation_count').default(0).notNull(),
  successCount: integer('success_count').default(0).notNull(),
  failureCount: integer('failure_count').default(0).notNull(),
  refundCount: integer('refund_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePublisherNameVersion: unique().on(table.publisherId, table.name, table.version),
}));

// Invocations (ledger)
export const invocations = pgTable('invocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerId: uuid('caller_id').references(() => accounts.id).notNull(),
  protocolId: uuid('protocol_id').references(() => protocols.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  publisherAmountCents: integer('publisher_amount_cents'),
  platformFeeCents: integer('platform_fee_cents'),
  status: text('status').notNull(), // PENDING | SUCCESS | FAILURE | REFUNDED | REFUSED
  debugSharing: boolean('debug_sharing').default(false).notNull(),
  errorClass: text('error_class'),
  inputMetadata: jsonb('input_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Balance transactions
export const balanceTransactions = pgTable('balance_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  type: text('type').notNull(), // DEPOSIT | INVOCATION | REFUND | EARNING | WITHDRAWAL
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Unusable reports
export const unusableReports = pgTable('unusable_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  invocationId: uuid('invocation_id').references(() => invocations.id).notNull(),
  callerId: uuid('caller_id').references(() => accounts.id).notNull(),
  protocolId: uuid('protocol_id').references(() => protocols.id).notNull(),
  reason: text('reason'),
  flagged: boolean('flagged').default(false).notNull(),
  reviewed: boolean('reviewed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
