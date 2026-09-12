import {
  pgTable,
  serial,
  varchar,
  doublePrecision,
  timestamp,
  uuid,
  integer,
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

export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(),
  total_score: integer('total_score').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  finished_at: timestamp('finished_at', { withTimezone: true }),
});

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
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
