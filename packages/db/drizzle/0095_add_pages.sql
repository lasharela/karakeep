CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`content` text DEFAULT '' NOT NULL,
	`note` text,
	`topic` text,
	`imageUrl` text,
	`imageAssetId` text,
	`sourceUrl` text,
	`archived` integer DEFAULT false NOT NULL,
	`favourited` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imageAssetId`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pages_userId_topic_idx` ON `pages` (`userId`,`topic`);--> statement-breakpoint
CREATE INDEX `pages_userId_createdAt_id_idx` ON `pages` (`userId`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `pagesInLists` (
	`pageId` text NOT NULL,
	`listId` text NOT NULL,
	`addedAt` integer,
	PRIMARY KEY(`pageId`, `listId`),
	FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pagesInLists_listId_pageId_idx` ON `pagesInLists` (`listId`,`pageId`);--> statement-breakpoint
CREATE TABLE `tagsOnPages` (
	`pageId` text NOT NULL,
	`tagId` text NOT NULL,
	`attachedAt` integer,
	`attachedBy` text DEFAULT 'human' NOT NULL,
	PRIMARY KEY(`pageId`, `tagId`),
	FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tagsOnPages_tagId_pageId_idx` ON `tagsOnPages` (`tagId`,`pageId`);