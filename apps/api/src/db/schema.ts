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
  primaryKey,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { ChampionshipStatus, StreetviewMode } from '@paguessr/shared';

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
    championship_match_id: uuid('championship_match_id').references(
      (): AnyPgColumn => championshipMatches.id,
      { onDelete: 'cascade' }
    ),
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
  streetview_mode: text('streetview_mode').$type<StreetviewMode>().notNull().default('static'),
  duration_seconds: integer('duration_seconds').notNull().default(60),
  started_at: timestamp('started_at', { withTimezone: true }),
  // Quantas vezes o proxy já buscou a imagem desta rodada no Google (cota paga).
  image_fetches: integer('image_fetches').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const streetviewPanoramaUsage = pgTable('streetview_panorama_usage', {
  year_month: text('year_month').primaryKey(),
  count: integer('count').notNull().default(0),
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

export const championships = pgTable('championships', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 80 }).notNull(),
  description: text('description'),
  banner_url: text('banner_url'),
  max_participants: integer('max_participants').notNull(),
  rounds_per_match: integer('rounds_per_match').notNull(),
  round_duration_seconds: integer('round_duration_seconds').notNull().default(60),
  phase_interval_seconds: integer('phase_interval_seconds').notNull(),
  status: text('status').$type<ChampionshipStatus>().notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  seeded_at: timestamp('seeded_at', { withTimezone: true }),
  started_at: timestamp('started_at', { withTimezone: true }),
  finished_at: timestamp('finished_at', { withTimezone: true }),
});

export const championshipParticipants = pgTable(
  'championship_participants',
  {
    championship_id: uuid('championship_id')
      .notNull()
      .references(() => championships.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seed: integer('seed'),
    joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    eliminated_in_phase: integer('eliminated_in_phase'),
  },
  (table) => [
    primaryKey({ columns: [table.championship_id, table.user_id] }),
    index('championship_participants_championship_id_idx').on(table.championship_id),
  ]
);

export const championshipMatches = pgTable(
  'championship_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    championship_id: uuid('championship_id')
      .notNull()
      .references(() => championships.id, { onDelete: 'cascade' }),
    phase: integer('phase').notNull(),
    slot: integer('slot').notNull(),
    player_a_id: uuid('player_a_id').references(() => users.id),
    player_b_id: uuid('player_b_id').references(() => users.id),
    game_a_id: uuid('game_a_id').references((): AnyPgColumn => games.id, { onDelete: 'set null' }),
    game_b_id: uuid('game_b_id').references((): AnyPgColumn => games.id, { onDelete: 'set null' }),
    score_a: integer('score_a'),
    score_b: integer('score_b'),
    winner_id: uuid('winner_id').references(() => users.id),
    opens_at: timestamp('opens_at', { withTimezone: true }),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.championship_id, table.phase, table.slot),
  ]
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
export type StreetviewPanoramaUsage = typeof streetviewPanoramaUsage.$inferSelect;
export type NewStreetviewPanoramaUsage = typeof streetviewPanoramaUsage.$inferInsert;
export type Championship = typeof championships.$inferSelect;
export type NewChampionship = typeof championships.$inferInsert;
export type ChampionshipParticipant = typeof championshipParticipants.$inferSelect;
export type NewChampionshipParticipant = typeof championshipParticipants.$inferInsert;
export type ChampionshipMatch = typeof championshipMatches.$inferSelect;
export type NewChampionshipMatch = typeof championshipMatches.$inferInsert;
