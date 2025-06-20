import { db } from "../../db";
import {
  organization,
  author,
  repository,
  dailyContribution,
  authorOrganizationHistory,
  contributionSummary,
  organizationConnection,
  authorEmail,
} from "../../schema/github";
import {
  and,
  desc,
  eq,
  gte,
  sql,
  min,
  max,
  sum,
  count,
  asc,
  inArray,
  getTableColumns,
  not,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

// Cleanup queries
export async function clearAllGitHubData(): Promise<void> {
  console.log("🧹 Clearing all GitHub data...");

  const deleteOperations = [
    { table: dailyContribution, description: "daily contributions" },
    {
      table: authorOrganizationHistory,
      description: "author organization history",
    },
    { table: contributionSummary, description: "contribution summaries" },
    { table: organizationConnection, description: "organization connections" },
    { table: authorEmail, description: "author emails" },
    { table: repository, description: "repositories" },
    { table: author, description: "authors" },
    { table: organization, description: "organizations" },
  ];

  try {
    console.log("   🔄 Using ordered deletion method...");

    for (const operation of deleteOperations) {
      await db.delete(operation.table);
      console.log(`   ✅ Cleared ${operation.description}`);
    }

    console.log("🧹 All GitHub data cleared successfully!\n");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Cleanup failed:", errorMessage);
    throw new Error(`GitHub data cleanup failed: ${errorMessage}`);
  }
}

// Organization queries
export async function insertOrganization(org: {
  githubId: number;
  login: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const [result] = await db
    .insert(organization)
    .values({
      ...org,
      isActive: org.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: organization.githubId,
      set: {
        login: org.login,
        name: org.name,
        description: org.description,
        avatarUrl: org.avatarUrl,
        isActive: sql`COALESCE(${org.isActive ?? true}, ${organization.isActive})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: organization.id });
  return result;
}

// Author queries
export async function insertAuthor(authorData: {
  githubId: number;
  login: string;
  name?: string;
  avatarUrl?: string;
  primaryEmail?: string;
}): Promise<{ id: string }> {
  const [result] = await db
    .insert(author)
    .values({ ...authorData, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: author.githubId,
      set: {
        login: authorData.login,
        name: sql`COALESCE(${authorData.name}, ${author.name})`,
        avatarUrl: sql`COALESCE(${authorData.avatarUrl}, ${author.avatarUrl})`,
        primaryEmail: sql`COALESCE(${authorData.primaryEmail}, ${author.primaryEmail})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: author.id });
  return result;
}

// Author email queries
export async function insertOrUpdateAuthorEmail(data: {
  authorId: string;
  email: string;
  commitDate: Date;
}): Promise<void> {
  await db
    .insert(authorEmail)
    .values({
      ...data,
      commitCount: 1,
      firstSeenAt: data.commitDate,
      lastSeenAt: data.commitDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [authorEmail.authorId, authorEmail.email],
      set: {
        commitCount: sql`${authorEmail.commitCount} + 1`,
        lastSeenAt: sql`GREATEST(${data.commitDate}, ${authorEmail.lastSeenAt})`,
        firstSeenAt: sql`LEAST(${data.commitDate}, ${authorEmail.firstSeenAt})`,
        updatedAt: new Date(),
      },
    });
}

export async function updateAuthorPrimaryEmail(
  authorId: string
): Promise<void> {
  const subquery = db
    .select({ email: authorEmail.email })
    .from(authorEmail)
    .where(eq(authorEmail.authorId, authorId))
    .orderBy(desc(authorEmail.commitCount), desc(authorEmail.lastSeenAt))
    .limit(1);

  await db
    .update(author)
    .set({ primaryEmail: sql`(${subquery})`, updatedAt: new Date() })
    .where(eq(author.id, authorId));
}

// Repository queries
export async function insertRepository(repo: {
  githubId: number;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  isFork: boolean;
  forkDate?: string | Date;
  parentRepo?: string;
  sourceRepo?: string;
  forkDetectionMethod?: string;
  forkDetectionConfidence?: string;
  ownerId: string;
  starsCount: number;
  forksCount: number;
  commitsCount: number;
  primaryLanguage?: string;
}): Promise<{ id: string }> {
  const values = {
    ...repo,
    forkDate: repo.forkDate ? new Date(repo.forkDate) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const [result] = await db
    .insert(repository)
    .values(values)
    .onConflictDoUpdate({
      target: repository.githubId,
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning({ id: repository.id });
  return result;
}

export async function insertDailyContribution(contribution: {
  repositoryId: string;
  authorId: string;
  date: Date;
  commits: number;
  additions: number;
  deletions: number;
}): Promise<void> {
  await db
    .insert(dailyContribution)
    .values({ ...contribution, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [
        dailyContribution.repositoryId,
        dailyContribution.authorId,
        dailyContribution.date,
      ],
      set: {
        commits: contribution.commits,
        additions: contribution.additions,
        deletions: contribution.deletions,
      },
    });
}

export async function updateAuthorOrgHistory(data: {
  authorId: string;
  organizationId: string;
  joinedAt: Date;
}): Promise<void> {
  await db
    .insert(authorOrganizationHistory)
    .values({ ...data, createdAt: new Date() })
    .onConflictDoNothing();
}

// Contribution summary
export async function updateContributionSummary(data: {
  authorId: string;
  organizationId: string;
  totalCommits: number;
  firstContributionAt: Date;
  lastContributionAt: Date;
}): Promise<void> {
  await db
    .insert(contributionSummary)
    .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        contributionSummary.authorId,
        contributionSummary.organizationId,
      ],
      set: {
        totalCommits: data.totalCommits,
        firstContributionAt: data.firstContributionAt,
        lastContributionAt: data.lastContributionAt,
        updatedAt: new Date(),
      },
    });
}

// Whitelist/Blacklist operations
export async function setOrganizationActive(
  orgId: string,
  isActive: boolean
): Promise<void> {
  await db
    .update(organization)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(organization.id, orgId));
}

// Organization connections
export async function updateOrgConnection(data: {
  sourceOrgId: string;
  targetOrgId: string;
  sharedContributors: number;
}): Promise<void> {
  await db
    .insert(organizationConnection)
    .values({
      ...data,
      lastAnalyzedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        organizationConnection.sourceOrgId,
        organizationConnection.targetOrgId,
      ],
      set: {
        sharedContributors: data.sharedContributors,
        lastAnalyzedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

// Analysis queries
export async function getAuthorOrgTimeline(authorId?: string) {
  const query = db
    .select({
      authorLogin: author.login,
      orgName: organization.login,
      firstContribution: min(dailyContribution.date),
      lastContribution: max(dailyContribution.date),
    })
    .from(author)
    .innerJoin(dailyContribution, eq(dailyContribution.authorId, author.id))
    .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .innerJoin(organization, eq(organization.id, repository.ownerId))
    .groupBy(author.login, organization.login)
    .orderBy(author.login, asc(min(dailyContribution.date)));

  if (authorId) {
    query.where(eq(author.id, authorId));
  }

  const results = await query;

  const timelineByAuthor: Record<
    string,
    {
      orgName: string;
      firstContribution: Date;
      lastContribution: Date;
    }[]
  > = {};

  for (const row of results) {
    if (!timelineByAuthor[row.authorLogin]) {
      timelineByAuthor[row.authorLogin] = [];
    }
    timelineByAuthor[row.authorLogin].push({
      orgName: row.orgName,
      firstContribution: new Date(row.firstContribution),
      lastContribution: new Date(row.lastContribution),
    });
  }

  return Object.entries(timelineByAuthor).map(([login, orgTimeline]) => ({
    login,
    orgTimeline,
  }));
}

export async function getOrgContributors(orgId: string) {
  const orgReposQuery = db
    .select({ id: repository.id })
    .from(repository)
    .where(eq(repository.ownerId, orgId));

  return db
    .select({
      id: author.id,
      login: author.login,
      name: author.name,
      reposContributed: count(sql`distinct ${dailyContribution.repositoryId}`),
      totalCommits: sum(dailyContribution.commits),
      firstContribution: min(dailyContribution.date),
      lastContribution: max(dailyContribution.date),
    })
    .from(author)
    .innerJoin(dailyContribution, eq(dailyContribution.authorId, author.id))
    .where(inArray(dailyContribution.repositoryId, orgReposQuery))
    .groupBy(author.id, author.login, author.name)
    .orderBy(desc(sum(dailyContribution.commits)));
}

export async function getInterOrgConnections(minSharedContributors = 1) {
  const src = alias(organization, "src");
  const tgt = alias(organization, "tgt");

  return db
    .select({
      sourceOrg: src.login,
      targetOrg: tgt.login,
      sharedContributors: organizationConnection.sharedContributors,
    })
    .from(organizationConnection)
    .innerJoin(src, eq(src.id, organizationConnection.sourceOrgId))
    .innerJoin(tgt, eq(tgt.id, organizationConnection.targetOrgId))
    .where(
      gte(organizationConnection.sharedContributors, minSharedContributors)
    )
    .orderBy(desc(organizationConnection.sharedContributors));
}

// Get repositories by organization with fork details
export async function getOrgRepositories(
  orgId: string,
  includeInactive = false
) {
  const query = db
    .select()
    .from(repository)
    .where(
      and(
        eq(repository.ownerId, orgId),
        includeInactive ? undefined : eq(repository.isActive, true)
      )
    )
    .orderBy(desc(repository.starsCount));

  return query;
}

// Get contributions filtered by date
export async function getContributionsAfterDate(
  repositoryId: string,
  afterDate: Date
) {
  return db
    .select({
      ...getTableColumns(dailyContribution),
      authorLogin: author.login,
      authorName: author.name,
    })
    .from(dailyContribution)
    .innerJoin(author, eq(author.id, dailyContribution.authorId))
    .where(
      and(
        eq(dailyContribution.repositoryId, repositoryId),
        gte(dailyContribution.date, afterDate)
      )
    )
    .orderBy(asc(dailyContribution.date));
}

// Get author's contributions to context organizations
export async function getAuthorContextOrgContributions(authorId: string) {
  const contextOrgsQuery = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.isActive, true));

  return db
    .select({
      orgName: organization.login,
      repoName: repository.name,
      isFork: repository.isFork,
      commits: sum(dailyContribution.commits),
      additions: sum(dailyContribution.additions),
      deletions: sum(dailyContribution.deletions),
      firstContributionDate: min(dailyContribution.date),
      lastContributionDate: max(dailyContribution.date),
    })
    .from(dailyContribution)
    .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .innerJoin(organization, eq(organization.id, repository.ownerId))
    .where(
      and(
        eq(dailyContribution.authorId, authorId),
        inArray(repository.ownerId, contextOrgsQuery)
      )
    )
    .groupBy(organization.login, repository.name, repository.isFork)
    .orderBy(organization.login, desc(max(dailyContribution.date)));
}

// Get organization's contributors from other context organizations
export async function getOrgContributorsFromContextOrgs(
  orgId: string,
  minContributions = 1
) {
  const contextOrgsQuery = db
    .select({ id: organization.id })
    .from(organization)
    .where(
      and(eq(organization.isActive, true), not(eq(organization.id, orgId)))
    );

  const orgContributorsQuery = db
    .select({ authorId: dailyContribution.authorId })
    .from(dailyContribution)
    .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .where(eq(repository.ownerId, orgId))
    .groupBy(dailyContribution.authorId)
    .having(gte(sum(dailyContribution.commits), minContributions));

  return db
    .select({
      authorLogin: author.login,
      authorName: author.name,
      otherOrg: organization.login,
      reposContributed: count(sql`distinct ${repository.id}`),
      totalCommits: sum(dailyContribution.commits),
    })
    .from(dailyContribution)
    .innerJoin(author, eq(author.id, dailyContribution.authorId))
    .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .innerJoin(organization, eq(organization.id, repository.ownerId))
    .where(
      and(
        inArray(author.id, orgContributorsQuery),
        inArray(organization.id, contextOrgsQuery)
      )
    )
    .groupBy(author.login, author.name, organization.login)
    .orderBy(desc(sum(dailyContribution.commits)));
}

// Update organization connection strengths
export async function updateOrgConnectionStrengths(): Promise<void> {
  // This is a complex query to translate to Drizzle and might be better
  // handled with a raw query or broken down into smaller queries.
  // The logic involves self-joining and complex aggregations.
  // For now, leaving as a raw query is safer.
  await db.run(
    sql`
    WITH contributor_counts AS (
      SELECT 
        r.owner_id as org_id,
        dc.author_id,
        COUNT(DISTINCT r.id) as repo_count,
        SUM(dc.commits) as commit_count
      FROM github.daily_contribution dc
      JOIN github.repository r ON r.id = dc.repository_id
      GROUP BY r.owner_id, dc.author_id
    ),
    org_pairs AS (
      SELECT 
        c1.org_id as source_org_id,
        c2.org_id as target_org_id,
        COUNT(DISTINCT c1.author_id) as shared_contributors
      FROM contributor_counts c1
      JOIN contributor_counts c2 ON c1.author_id = c2.author_id
      WHERE c1.org_id < c2.org_id
      GROUP BY c1.org_id, c2.org_id
    )
    INSERT INTO github.organization_connection (
      source_org_id, target_org_id, shared_contributors,
      last_analyzed_at, updated_at
    )
    SELECT 
      source_org_id, target_org_id, shared_contributors,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM org_pairs
    ON CONFLICT (source_org_id, target_org_id) DO UPDATE SET
      shared_contributors = EXCLUDED.shared_contributors,
      last_analyzed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    `
  );
}

// Add these new queries for reports
export async function getOrganizationStats(orgId: string) {
  const repoStatsQuery = db
    .select({
      id: repository.id,
      name: repository.name,
      starsCount: repository.starsCount,
      commitsCount: repository.commitsCount,
      contributorCount: count(sql`distinct ${dailyContribution.authorId}`),
    })
    .from(repository)
    .leftJoin(
      dailyContribution,
      eq(dailyContribution.repositoryId, repository.id)
    )
    .where(eq(repository.ownerId, orgId))
    .groupBy(
      repository.id,
      repository.name,
      repository.starsCount,
      repository.commitsCount
    );

  const contributorStatsQuery = db
    .select({
      login: author.login,
      reposContributed: count(sql`distinct ${dailyContribution.repositoryId}`),
      totalCommits: sum(dailyContribution.commits),
    })
    .from(dailyContribution)
    .innerJoin(author, eq(author.id, dailyContribution.authorId))
    .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .where(eq(repository.ownerId, orgId))
    .groupBy(author.login)
    .orderBy(desc(sum(dailyContribution.commits)))
    .limit(10);

  const orgStats = await db
    .select({
      name: organization.login,
      totalRepos: count(sql`distinct ${repository.id}`),
      totalContributors: count(sql`distinct ${dailyContribution.authorId}`),
      totalCommits: sum(dailyContribution.commits),
    })
    .from(organization)
    .leftJoin(repository, eq(repository.ownerId, organization.id))
    .leftJoin(
      dailyContribution,
      eq(dailyContribution.repositoryId, repository.id)
    )
    .where(eq(organization.id, orgId))
    .groupBy(organization.login);

  const topRepositories = await db
    .select()
    .from(repoStatsQuery.as("repo_stats"))
    .orderBy(desc(sql`starsCount`))
    .limit(10);
  const topContributors = await db
    .select()
    .from(contributorStatsQuery.as("contributor_stats"));

  if (orgStats.length === 0) {
    return null;
  }

  return {
    ...orgStats[0],
    topRepositories,
    topContributors,
  };
}
