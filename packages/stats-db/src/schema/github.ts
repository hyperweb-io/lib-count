import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { randomUUID } from "crypto";

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  githubId: integer("github_id").unique().notNull(),
  login: text("login").notNull(),
  name: text("name"),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(new Date())
    .$onUpdate(() => new Date()),
});

export const author = sqliteTable("author", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  githubId: integer("github_id").unique().notNull(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  primaryEmail: text("primary_email"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(new Date())
    .$onUpdate(() => new Date()),
});

export const authorEmail = sqliteTable(
  "author_email",
  {
    id: text("id").$defaultFn(randomUUID),
    authorId: text("author_id")
      .notNull()
      .references(() => author.id),
    email: text("email").notNull(),
    commitCount: integer("commit_count").notNull().default(1),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.authorId, table.email] }),
    };
  }
);

export const repository = sqliteTable("repository", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  githubId: integer("github_id").unique().notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  isFork: integer("is_fork", { mode: "boolean" }).notNull().default(false),
  forkDate: integer("fork_date", { mode: "timestamp" }),
  parentRepo: text("parent_repo"),
  sourceRepo: text("source_repo"),
  forkDetectionMethod: text("fork_detection_method"),
  forkDetectionConfidence: text("fork_detection_confidence"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => organization.id),
  starsCount: integer("stars_count").notNull().default(0),
  forksCount: integer("forks_count").notNull().default(0),
  commitsCount: integer("commits_count").notNull().default(0),
  primaryLanguage: text("primary_language"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(new Date())
    .$onUpdate(() => new Date()),
});

export const dailyContribution = sqliteTable(
  "daily_contribution",
  {
    id: text("id").$defaultFn(randomUUID),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repository.id),
    authorId: text("author_id")
      .notNull()
      .references(() => author.id),
    date: integer("date", { mode: "timestamp" }).notNull(),
    commits: integer("commits").notNull().default(0),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.repositoryId, table.authorId, table.date],
      }),
    };
  }
);

export const authorOrganizationHistory = sqliteTable(
  "author_organization_history",
  {
    id: text("id").$defaultFn(randomUUID),
    authorId: text("author_id")
      .notNull()
      .references(() => author.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.authorId, table.organizationId, table.joinedAt],
      }),
    };
  }
);

export const organizationConnection = sqliteTable(
  "organization_connection",
  {
    id: text("id").$defaultFn(randomUUID),
    sourceOrgId: text("source_org_id")
      .notNull()
      .references(() => organization.id),
    targetOrgId: text("target_org_id")
      .notNull()
      .references(() => organization.id),
    sharedContributors: integer("shared_contributors").notNull().default(0),
    lastAnalyzedAt: integer("last_analyzed_at", {
      mode: "timestamp",
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.sourceOrgId, table.targetOrgId] }),
    };
  }
);

export const contributionSummary = sqliteTable(
  "contribution_summary",
  {
    id: text("id").$defaultFn(randomUUID),
    authorId: text("author_id")
      .notNull()
      .references(() => author.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    totalCommits: integer("total_commits").notNull().default(0),
    firstContributionAt: integer("first_contribution_at", {
      mode: "timestamp",
    }).notNull(),
    lastContributionAt: integer("last_contribution_at", {
      mode: "timestamp",
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.authorId, table.organizationId] }),
    };
  }
);

export const organizationRelations = relations(organization, ({ many }) => ({
  repositories: many(repository),
  authorOrganizationHistories: many(authorOrganizationHistory),
  sourceOrganizationConnections: many(organizationConnection, {
    relationName: "source_org",
  }),
  targetOrganizationConnections: many(organizationConnection, {
    relationName: "target_org",
  }),
  contributionSummaries: many(contributionSummary),
}));

export const authorRelations = relations(author, ({ many }) => ({
  authorEmails: many(authorEmail),
  dailyContributions: many(dailyContribution),
  authorOrganizationHistories: many(authorOrganizationHistory),
  contributionSummaries: many(contributionSummary),
}));

export const authorEmailRelations = relations(authorEmail, ({ one }) => ({
  author: one(author, {
    fields: [authorEmail.authorId],
    references: [author.id],
  }),
}));

export const repositoryRelations = relations(repository, ({ one, many }) => ({
  organization: one(organization, {
    fields: [repository.ownerId],
    references: [organization.id],
  }),
  dailyContributions: many(dailyContribution),
}));

export const dailyContributionRelations = relations(
  dailyContribution,
  ({ one }) => ({
    repository: one(repository, {
      fields: [dailyContribution.repositoryId],
      references: [repository.id],
    }),
    author: one(author, {
      fields: [dailyContribution.authorId],
      references: [author.id],
    }),
  })
);

export const authorOrganizationHistoryRelations = relations(
  authorOrganizationHistory,
  ({ one }) => ({
    author: one(author, {
      fields: [authorOrganizationHistory.authorId],
      references: [author.id],
    }),
    organization: one(organization, {
      fields: [authorOrganizationHistory.organizationId],
      references: [organization.id],
    }),
  })
);

export const organizationConnectionRelations = relations(
  organizationConnection,
  ({ one }) => ({
    sourceOrg: one(organization, {
      fields: [organizationConnection.sourceOrgId],
      references: [organization.id],
      relationName: "source_org",
    }),
    targetOrg: one(organization, {
      fields: [organizationConnection.targetOrgId],
      references: [organization.id],
      relationName: "target_org",
    }),
  })
);

export const contributionSummaryRelations = relations(
  contributionSummary,
  ({ one }) => ({
    author: one(author, {
      fields: [contributionSummary.authorId],
      references: [author.id],
    }),
    organization: one(organization, {
      fields: [contributionSummary.organizationId],
      references: [organization.id],
    }),
  })
);
