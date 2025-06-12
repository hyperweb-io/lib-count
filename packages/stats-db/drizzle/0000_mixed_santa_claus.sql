CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.705Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.705Z"' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_name_unique` ON `category` (`name`);--> statement-breakpoint
CREATE TABLE `daily_downloads` (
	`id` text,
	`package_name` text NOT NULL,
	`date` integer NOT NULL,
	`download_count` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.705Z"',
	PRIMARY KEY(`package_name`, `date`),
	FOREIGN KEY (`package_name`) REFERENCES `npm_package`(`package_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `npm_package` (
	`package_name` text PRIMARY KEY NOT NULL,
	`creation_date` integer NOT NULL,
	`last_publish_date` integer NOT NULL,
	`last_fetched_date` integer,
	`is_active` integer DEFAULT true,
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.704Z"'
);
--> statement-breakpoint
CREATE TABLE `package_category` (
	`package_id` text,
	`category_id` text,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.705Z"' NOT NULL,
	PRIMARY KEY(`package_id`, `category_id`),
	FOREIGN KEY (`package_id`) REFERENCES `npm_package`(`package_name`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `author` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`primary_email` text,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_github_id_unique` ON `author` (`github_id`);--> statement-breakpoint
CREATE TABLE `author_email` (
	`id` text,
	`author_id` text NOT NULL,
	`email` text NOT NULL,
	`commit_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	PRIMARY KEY(`author_id`, `email`),
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `author_organization_history` (
	`id` text,
	`author_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	PRIMARY KEY(`author_id`, `organization_id`, `joined_at`),
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contribution_summary` (
	`id` text,
	`author_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`total_commits` integer DEFAULT 0 NOT NULL,
	`first_contribution_at` integer NOT NULL,
	`last_contribution_at` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	PRIMARY KEY(`author_id`, `organization_id`),
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_contribution` (
	`id` text,
	`repository_id` text NOT NULL,
	`author_id` text NOT NULL,
	`date` integer NOT NULL,
	`commits` integer DEFAULT 0 NOT NULL,
	`additions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	PRIMARY KEY(`repository_id`, `author_id`, `date`),
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`description` text,
	`avatar_url` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_github_id_unique` ON `organization` (`github_id`);--> statement-breakpoint
CREATE TABLE `organization_connection` (
	`id` text,
	`source_org_id` text NOT NULL,
	`target_org_id` text NOT NULL,
	`shared_contributors` integer DEFAULT 0 NOT NULL,
	`last_analyzed_at` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	PRIMARY KEY(`source_org_id`, `target_org_id`),
	FOREIGN KEY (`source_org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repository` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`is_fork` integer DEFAULT false NOT NULL,
	`fork_date` integer,
	`parent_repo` text,
	`source_repo` text,
	`fork_detection_method` text,
	`fork_detection_confidence` text,
	`owner_id` text NOT NULL,
	`stars_count` integer DEFAULT 0 NOT NULL,
	`forks_count` integer DEFAULT 0 NOT NULL,
	`commits_count` integer DEFAULT 0 NOT NULL,
	`primary_language` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	`updated_at` integer DEFAULT '"2025-06-11T04:07:57.709Z"',
	FOREIGN KEY (`owner_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_github_id_unique` ON `repository` (`github_id`);