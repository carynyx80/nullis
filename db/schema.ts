import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const usernameClaims=sqliteTable('username_claims',{tag:text('tag').primaryKey(),owner:text('owner').notNull(),nonce:text('nonce').notNull(),expires:integer('expires').notNull(),domain:text('domain').notNull(),signature:text('signature').notNull()});
export const usernameChallenges=sqliteTable('username_challenges',{nonce:text('nonce').primaryKey(),tag:text('tag').notNull(),owner:text('owner').notNull(),expires:integer('expires').notNull(),domain:text('domain').notNull()});
export const usernameLimits=sqliteTable('username_limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
