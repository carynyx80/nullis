CREATE TABLE `username_challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`owner` text NOT NULL,
	`expires` integer NOT NULL,
	`domain` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `username_claims` (
	`tag` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`nonce` text NOT NULL,
	`expires` integer NOT NULL,
	`domain` text NOT NULL,
	`signature` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `username_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
