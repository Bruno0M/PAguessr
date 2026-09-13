import {
  pgTable,
  serial,
  varchar,
  text,
  doublePrecision,
  timestamp,
  uuid,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  pano_id: varchar('pano_id', { length: 255 }).notNull().unique(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  captured_at: timestamp('captured_at', { withTimezone: true }),
  source: varchar('source', { length: 50 }).notNull().default('streetview'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const games = pgTable(
  'games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    total_score: integer('total_score').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('games_user_id_idx').on(table.user_id)]
);

export const rounds = pgTable('rounds', {
  id: serial('id').primaryKey(),
  game_id: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  location_id: integer('location_id')
    .notNull()
    .references(() => locations.id),
  ordem: integer('ordem').notNull(),
  guess_lat: doublePrecision('guess_lat'),
  guess_lng: doublePrecision('guess_lng'),
  distancia: doublePrecision('distancia'),
  pontos: integer('pontos'),
  started_at: timestamp('started_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  nick: varchar('nick', { length: 16 }).notNull(),
  nick_normalizado: varchar('nick_normalizado', { length: 16 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  recovery_code_hash: text('recovery_code_hash').notNull(),
  avatar_id: integer('avatar_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.user_id)]
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
