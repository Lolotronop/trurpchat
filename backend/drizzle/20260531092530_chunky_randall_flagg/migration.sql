CREATE TABLE IF NOT EXISTS `keys` (
	`id` integer PRIMARY KEY,
	`key` text(255) NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`lastSeen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_keys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `messages` (
	`id` integer NOT NULL,
	`roomId` integer NOT NULL,
	`userId` integer NOT NULL,
	`text` text NOT NULL,
	`attachments` text,
	`replyTo` integer,
	`createdAt` integer NOT NULL,
	`editedAt` integer,
	`edited` integer DEFAULT false NOT NULL,
	`deletedAt` integer,
	`hasMention` integer DEFAULT false NOT NULL,
	CONSTRAINT `messages_pk` PRIMARY KEY(`id`, `roomId`),
	CONSTRAINT `fk_messages_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `permissions` (
	`id` integer PRIMARY KEY,
	`subject_type` text NOT NULL,
	`subject_id` integer,
	`room_id` integer,
	`allow` integer DEFAULT 0 NOT NULL,
	`deny` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_permissions_room_id_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT "permissions_subject_check" CHECK(("subject_type" = 'everyone' AND "subject_id" IS NULL) OR ("subject_type" IN ('role', 'user') AND "subject_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roles` (
	`id` integer PRIMARY KEY,
	`name` text(255) NOT NULL,
	`color` integer NOT NULL,
	`section` integer DEFAULT false NOT NULL,
	`order` real DEFAULT 0 NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` integer PRIMARY KEY,
	`name` text(255) NOT NULL,
	`type` text NOT NULL,
	`visibility_mode` text DEFAULT 'inherit' NOT NULL,
	`order` real NOT NULL,
	`nextMessageId` integer DEFAULT 0 NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `server_meta` (
	`id` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `unread` (
	`roomId` integer NOT NULL,
	`userId` integer NOT NULL,
	`unreadId` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `unread_pk` PRIMARY KEY(`userId`, `roomId`),
	CONSTRAINT `fk_unread_roomId_rooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_unread_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_roles` (
	`userId` integer NOT NULL,
	`roleId` integer NOT NULL,
	CONSTRAINT `user_roles_pk` PRIMARY KEY(`userId`, `roleId`),
	CONSTRAINT `fk_user_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_roles_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY,
	`name` text(255) NOT NULL,
	`displayName` text(255),
	`deletedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `permissions_unique` ON `permissions` (`subject_type`,`subject_id`,`room_id`);