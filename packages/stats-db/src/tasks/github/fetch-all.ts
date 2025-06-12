import "../../setup-env";
import { RestEndpointMethodTypes } from "@octokit/rest";
import * as queries from "./github.queries";
import { organizations, fetchTypes, knownForks } from "./data-config";
import { createOctokitClient, makeApiCall } from "./octokit-client";
import { detectRepositoryFork, ForkDetectionOptions } from "./fork-detection";
import { db } from "../../db";
import {
  author,
  authorEmail,
  authorOrganizationHistory,
  contributionSummary,
  dailyContribution,
  organization,
  organizationConnection,
  repository,
} from "../../schema/github";
import { and, count, eq, inArray, sql } from "drizzle-orm";

// Fetch Configuration
// Configure data collection limits and behavior
// Set numeric values to null to fetch all data (production mode)
const FETCH_CONFIG: {
  BATCH_SIZE: number;
  CLEAR_DATA_BEFORE_FETCH: boolean;
  MAX_REPOS_PER_ORG: number | null;
  MAX_CONTRIBUTORS_PER_REPO: number | null;
  ENABLE_DETAILED_LOGGING: boolean;
  FILTER_BOTS: boolean;
  SAMPLE_COMMITS_FOR_EMAILS: boolean;
  MAX_COMMITS_TO_SAMPLE: number;
} = {
  BATCH_SIZE: 10,
  CLEAR_DATA_BEFORE_FETCH: true, // Set to false to keep existing data
  MAX_REPOS_PER_ORG: null, // Set to null to process all repos (production mode)
  MAX_CONTRIBUTORS_PER_REPO: null, // Set to null to process all contributors (production mode)
  ENABLE_DETAILED_LOGGING: true, // Enable verbose logging for debugging
  FILTER_BOTS: true, // Filter out common bots from contributors
  SAMPLE_COMMITS_FOR_EMAILS: true, // Sample commits to collect email addresses
  MAX_COMMITS_TO_SAMPLE: 5, // Number of commits to sample per contributor for emails
};

// Common bot patterns to filter out
const BOT_PATTERNS = [
  /^dependabot(\[bot\])?$/i,
  /^renovate(\[bot\])?$/i,
  /^greenkeeper(\[bot\])?$/i,
  /^codecov(\[bot\])?$/i,
  /^github-actions(\[bot\])?$/i,
  /^semantic-release-bot$/i,
  /^snyk-bot$/i,
  /^whitesource-bolt(\[bot\])?$/i,
  /^allcontributors(\[bot\])?$/i,
  /^imgbot(\[bot\])?$/i,
  /^deepsource-autofix(\[bot\])?$/i,
  /^pre-commit-ci(\[bot\])?$/i,
  /^gitpod-io(\[bot\])?$/i,
  /^web-flow$/i, // GitHub web interface commits
  /bot$/i, // Generic bot suffix
  /\[bot\]$/i, // GitHub bot format
];

/**
 * Check if a username appears to be a bot
 */
function isBot(username: string): boolean {
  if (!FETCH_CONFIG.FILTER_BOTS) return false;

  return BOT_PATTERNS.some((pattern) => pattern.test(username));
}

/**
 * Sample commits from a contributor to extract email addresses
 */
async function sampleCommitsForEmails(
  authorId: string,
  authorLogin: string,
  org: string,
  repo: string
): Promise<void> {
  if (!FETCH_CONFIG.SAMPLE_COMMITS_FOR_EMAILS) return;

  try {
    console.log(
      `        📧 Sampling commits for ${authorLogin} email addresses...`
    );

    const { data: commits } = await makeApiCall(octokit, () =>
      octokit.rest.repos.listCommits({
        owner: org,
        repo: repo,
        author: authorLogin,
        per_page: FETCH_CONFIG.MAX_COMMITS_TO_SAMPLE,
      })
    );

    if (commits.length === 0) {
      console.log(`        📧 No commits found for ${authorLogin}`);
      return;
    }

    const emailsFound = new Set<string>();

    for (const commit of commits) {
      if (commit.commit?.author?.email) {
        const email = commit.commit.author.email.toLowerCase().trim();

        if (
          email &&
          email !== "noreply@github.com" &&
          !email.includes("users.noreply.github.com") &&
          email.includes("@") &&
          email.length > 5
        ) {
          emailsFound.add(email);

          await queries.insertOrUpdateAuthorEmail({
            authorId: authorId,
            email: email,
            commitDate: new Date(commit.commit.author.date),
          });
        }
      }
    }

    if (emailsFound.size > 0) {
      console.log(
        `        📧 Found ${emailsFound.size} unique emails for ${authorLogin}: ${Array.from(emailsFound).join(", ")}`
      );

      await queries.updateAuthorPrimaryEmail(authorId);
    } else {
      console.log(`        📧 No valid emails found for ${authorLogin}`);
    }
  } catch (error) {
    console.log(
      `        ⚠️  Failed to sample commits for ${authorLogin}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Fork Detection Configuration
const FORK_DETECTION_CONFIG: ForkDetectionOptions = {
  enableCommitAnalysis: true, // Enable commit-based fork detection
  enableNameSimilarity: false, // Disable name similarity (can be noisy)
  maxCommitsToAnalyze: 10, // Analyze up to 10 commits for fork indicators
  similarityThreshold: 0.85, // High threshold for name similarity
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN environment variable is required");
}

// Add type definitions for API responses
type OrgRepo =
  RestEndpointMethodTypes["repos"]["listForOrg"]["response"]["data"][0];
type ContributorStats = NonNullable<
  RestEndpointMethodTypes["repos"]["getContributorsStats"]["response"]["data"]
>;

// Add a custom type for our internal repository representation
type Repository = {
  githubId: number;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  isFork: boolean;
  forkDate?: string | Date; // Allow both string and Date
  starsCount: number;
  forksCount: number;
  commitsCount: number;
  primaryLanguage?: string;
  ownerId?: string;
};

const octokit = createOctokitClient(GITHUB_TOKEN);

// Add delay helper
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchContributorOrganizations(
  authorId: string,
  login: string
): Promise<void> {
  console.log(`      🔍 Fetching organizations for contributor ${login}...`);

  try {
    const authorOrgs = await makeApiCall(octokit, () =>
      octokit.paginate(octokit.rest.orgs.listForUser, {
        username: login,
        per_page: 100,
      })
    );

    for (const org of authorOrgs) {
      const { id: orgId } = await queries.insertOrganization({
        githubId: org.id,
        login: org.login,
        name: org.login || undefined,
        description: org.description || undefined,
        avatarUrl: org.avatar_url,
      });

      await queries.updateAuthorOrgHistory({
        authorId: authorId,
        organizationId: orgId,
        joinedAt: new Date(),
      });
    }

    console.log(
      `      ✅ Found ${authorOrgs.length} organizations for ${login}`
    );
  } catch (error) {
    console.warn(
      `      ⚠️  Failed to fetch organizations for ${login}:`,
      error
    );
  }
}

async function fetchOrganizationData(
  org: string,
  fetchType: string
): Promise<void> {
  console.log(`\n📦 Processing organization: ${org}`);

  console.log(`  ⬇️  Fetching organization details...`);
  const { data: orgData } = await makeApiCall(octokit, () =>
    octokit.rest.orgs.get({ org })
  );

  const { id: orgId } = await queries.insertOrganization({
    githubId: orgData.id,
    login: orgData.login,
    name: orgData.name || undefined,
    description: orgData.description || undefined,
    avatarUrl: orgData.avatar_url,
  });
  console.log(`  ✅ Organization details saved`);

  console.log(`  ⬇️  Fetching repositories...`);
  const repos = await makeApiCall(octokit, () =>
    octokit.paginate(octokit.rest.repos.listForOrg, {
      org,
      type: "all",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    })
  );
  console.log(`  📊 Found ${repos.length} repositories`);

  const sortedRepos = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .map(
      (repo: OrgRepo): Repository => ({
        githubId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        isFork: repo.fork,
        starsCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        commitsCount: 0,
        primaryLanguage: repo.language,
      })
    );

  let targetRepos =
    fetchType === fetchTypes.top10
      ? sortedRepos.slice(0, 10)
      : fetchType === fetchTypes.top3
        ? sortedRepos.slice(0, 3)
        : sortedRepos;

  if (FETCH_CONFIG.MAX_REPOS_PER_ORG !== null) {
    targetRepos = targetRepos.slice(0, FETCH_CONFIG.MAX_REPOS_PER_ORG);
    console.log(
      `  🔧 FETCH LIMIT: Limited to ${FETCH_CONFIG.MAX_REPOS_PER_ORG} repositories`
    );
  }

  console.log(
    `  🎯 Processing ${targetRepos.length} repositories (${
      fetchType === fetchTypes.top10
        ? "top 10"
        : fetchType === fetchTypes.top3
          ? "top 3"
          : "all"
    }${FETCH_CONFIG.MAX_REPOS_PER_ORG !== null ? " - FETCH LIMITED" : ""})`
  );

  let processedRepos = 0;
  for (let i = 0; i < targetRepos.length; i += FETCH_CONFIG.BATCH_SIZE) {
    const batch = targetRepos.slice(i, i + FETCH_CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(async (repo: Repository) => {
        try {
          console.log(`    📂 Processing ${repo.fullName}...`);
          console.log(`      🔍 Performing comprehensive fork analysis...`);

          const forkInfo = await detectRepositoryFork(
            octokit,
            org,
            repo.name,
            knownForks,
            FORK_DETECTION_CONFIG
          );

          repo.isFork = forkInfo.isFork;
          repo.forkDate = forkInfo.forkDate;

          if (forkInfo.isFork) {
            console.log(
              `      📑 Fork detected! Method: ${forkInfo.detectionMethod}, Confidence: ${forkInfo.confidence}`
            );
          } else {
            console.log(
              `      ✅ Not a fork (confidence: ${forkInfo.confidence})`
            );
          }

          const { id: repoId } = await queries.insertRepository({
            ...repo,
            parentRepo: forkInfo.parentRepo,
            sourceRepo: forkInfo.sourceRepo,
            forkDetectionMethod: forkInfo.detectionMethod,
            forkDetectionConfidence: forkInfo.confidence,
            ownerId: orgId,
          });

          console.log(`      📊 Fetching contributor statistics...`);

          let stats = (await makeApiCall(octokit, () =>
            octokit.paginate(octokit.rest.repos.getContributorsStats, {
              owner: org,
              repo: repo.name,
            })
          )) as ContributorStats;

          if (FETCH_CONFIG.FILTER_BOTS) {
            stats = stats.filter(
              (stat) => stat.author && !isBot(stat.author.login)
            );
          }

          if (FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO !== null) {
            stats = stats.slice(0, FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO);
          }

          let totalCommits = 0;

          await Promise.all(
            stats.map(async (stat) => {
              if (!stat.author) return;

              const { id: authorId } = await queries.insertAuthor({
                githubId: stat.author.id,
                login: stat.author.login,
                name: undefined,
                avatarUrl: stat.author.avatar_url,
              });

              await fetchContributorOrganizations(authorId, stat.author.login);
              await sampleCommitsForEmails(
                authorId,
                stat.author.login,
                org,
                repo.name
              );

              for (const week of stat.weeks) {
                if (
                  !repo.isFork ||
                  new Date(week.w * 1000) >= new Date(repo.forkDate || 0)
                ) {
                  totalCommits += week.c;

                  await queries.insertDailyContribution({
                    repositoryId: repoId,
                    authorId: authorId,
                    date: new Date(week.w * 1000),
                    commits: week.c,
                    additions: week.a,
                    deletions: week.d,
                  });

                  if (week.c > 0) {
                    await queries.updateAuthorOrgHistory({
                      authorId: authorId,
                      organizationId: orgId,
                      joinedAt: new Date(week.w * 1000),
                    });
                  }
                }
              }

              await updateContributionSummary(authorId, orgId);
            })
          );

          await db
            .update(repository)
            .set({ commitsCount: totalCommits })
            .where(eq(repository.id, repoId));

          processedRepos++;
          console.log(
            `      ✅ Processed repository with ${totalCommits} commits from ${stats.length} contributors`
          );
          console.log(
            `      📈 Progress: ${processedRepos}/${targetRepos.length} repositories`
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "status" in error &&
            error.status === 403
          ) {
            console.log(`      ⏳ Rate limit hit, waiting for 60 seconds...`);
            await delay(60000);
            throw error;
          }
          throw error;
        }
      })
    );

    if (i + FETCH_CONFIG.BATCH_SIZE < targetRepos.length) {
      console.log(`    ⏳ Waiting between batches...`);
      await delay(5000);
    }
  }

  console.log(`  🔄 Updating organization connections for ${org}...`);
  const contextOrgContributors = await db
    .selectDistinct({ authorId: dailyContribution.authorId })
    .from(dailyContribution)
    .leftJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .where(
      and(
        eq(repository.ownerId, orgId),
        eq(repository.isActive, true),
        sql`${dailyContribution.commits} > 0`
      )
    );
  const contributorIds = contextOrgContributors.map((c) => c.authorId);

  if (contributorIds.length > 0) {
    const otherOrgsOfContributors = await db
      .selectDistinct({
        orgId: authorOrganizationHistory.organizationId,
        authorId: authorOrganizationHistory.authorId,
      })
      .from(authorOrganizationHistory)
      .where(inArray(authorOrganizationHistory.authorId, contributorIds));

    const sharedContributorsByOrg = new Map<string, Set<string>>();
    for (const record of otherOrgsOfContributors) {
      if (record.orgId !== orgId) {
        if (!sharedContributorsByOrg.has(record.orgId)) {
          sharedContributorsByOrg.set(record.orgId, new Set());
        }
        sharedContributorsByOrg.get(record.orgId)!.add(record.authorId);
      }
    }

    const recordsToInsert = [];
    for (const [targetOrgId, authorsSet] of sharedContributorsByOrg.entries()) {
      recordsToInsert.push({
        sourceOrgId: orgId,
        targetOrgId: targetOrgId,
        sharedContributors: authorsSet.size,
        lastAnalyzedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (recordsToInsert.length > 0) {
      await db
        .insert(organizationConnection)
        .values(recordsToInsert)
        .onConflictDoUpdate({
          target: [
            organizationConnection.sourceOrgId,
            organizationConnection.targetOrgId,
          ],
          set: {
            sharedContributors: sql`excluded.shared_contributors`,
            lastAnalyzedAt: sql`excluded.last_analyzed_at`,
            updatedAt: new Date(),
          },
        });
      console.log(
        `  ✅ Updated ${recordsToInsert.length} organization connections for ${org}.`
      );
    }
  }

  console.log(`✅ Completed processing organization: ${org}\n`);
}

async function updateContributionSummary(
  authorId: string,
  organizationId: string
): Promise<void> {
  const summaryData = await db
    .select({
      totalCommits: sql<number>`sum(${dailyContribution.commits})`.mapWith(
        Number
      ),
      firstContributionAt: sql<string>`min(${dailyContribution.date})`,
      lastContributionAt: sql<string>`max(${dailyContribution.date})`,
    })
    .from(dailyContribution)
    .leftJoin(repository, eq(repository.id, dailyContribution.repositoryId))
    .where(
      and(
        eq(dailyContribution.authorId, authorId),
        eq(repository.ownerId, organizationId)
      )
    )
    .groupBy(dailyContribution.authorId, repository.ownerId);

  if (summaryData.length > 0) {
    const summary = summaryData[0];
    await db
      .insert(contributionSummary)
      .values({
        authorId: authorId,
        organizationId: organizationId,
        totalCommits: summary.totalCommits,
        firstContributionAt: new Date(summary.firstContributionAt),
        lastContributionAt: new Date(summary.lastContributionAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          contributionSummary.authorId,
          contributionSummary.organizationId,
        ],
        set: {
          totalCommits: summary.totalCommits,
          firstContributionAt: new Date(summary.firstContributionAt),
          lastContributionAt: new Date(summary.lastContributionAt),
          updatedAt: new Date(),
        },
      });
  }
}

async function fetchAll(fetchType = fetchTypes.top10): Promise<void> {
  const scriptStartTime = Date.now();

  try {
    console.log("\n🚀 Starting GitHub data fetch...");
    console.log(`📋 Fetch type: ${fetchType}`);
    console.log(`🎯 Target organizations: ${organizations.join(", ")}`);

    // Log fetch configuration
    if (
      FETCH_CONFIG.MAX_REPOS_PER_ORG !== null ||
      FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO !== null ||
      FETCH_CONFIG.CLEAR_DATA_BEFORE_FETCH ||
      FETCH_CONFIG.FILTER_BOTS ||
      FETCH_CONFIG.ENABLE_DETAILED_LOGGING
    ) {
      console.log("\n🔧 FETCH CONFIGURATION:");
      if (FETCH_CONFIG.CLEAR_DATA_BEFORE_FETCH) {
        console.log(
          `   🧹 Clear data before fetch: ${FETCH_CONFIG.CLEAR_DATA_BEFORE_FETCH}`
        );
      }
      if (FETCH_CONFIG.MAX_REPOS_PER_ORG !== null) {
        console.log(
          `   📂 Max repos per org: ${FETCH_CONFIG.MAX_REPOS_PER_ORG}`
        );
      }
      if (FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO !== null) {
        console.log(
          `   👥 Max contributors per repo: ${FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO}`
        );
      }
      console.log(`   🤖 Filter bots: ${FETCH_CONFIG.FILTER_BOTS}`);
      console.log(
        `   📧 Sample commits for emails: ${FETCH_CONFIG.SAMPLE_COMMITS_FOR_EMAILS}`
      );
      if (FETCH_CONFIG.SAMPLE_COMMITS_FOR_EMAILS) {
        console.log(
          `   📊 Max commits to sample: ${FETCH_CONFIG.MAX_COMMITS_TO_SAMPLE}`
        );
      }
      console.log(
        `   📝 Detailed logging: ${FETCH_CONFIG.ENABLE_DETAILED_LOGGING}`
      );
    }
    console.log("");

    if (FETCH_CONFIG.CLEAR_DATA_BEFORE_FETCH) {
      await queries.clearAllGitHubData();
    }

    for (let i = 0; i < organizations.length; i += FETCH_CONFIG.BATCH_SIZE) {
      const batch = organizations.slice(i, i + FETCH_CONFIG.BATCH_SIZE);
      await Promise.all(
        batch.map((org) => fetchOrganizationData(org, fetchType))
      );
    }

    if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
      console.log("\n📊 FINAL COLLECTION SUMMARY:");
      const orgCount = await db.select({ value: count() }).from(organization);
      console.log(`   🏢 Organizations collected: ${orgCount[0].value}`);

      const repoCount = await db.select({ value: count() }).from(repository);
      console.log(`   📂 Repositories collected: ${repoCount[0].value}`);

      const authorCount = await db.select({ value: count() }).from(author);
      console.log(`   👥 Contributors collected: ${authorCount[0].value}`);

      const contributionCount = await db
        .select({ value: count() })
        .from(dailyContribution);
      console.log(
        `   📈 Daily contributions recorded: ${contributionCount[0].value}`
      );

      const connectionCount = await db
        .select({ value: count() })
        .from(organizationConnection);
      console.log(
        `   🔗 Organization connections: ${connectionCount[0].value}`
      );

      if (FETCH_CONFIG.SAMPLE_COMMITS_FOR_EMAILS) {
        const emailCount = await db
          .select({ value: count() })
          .from(authorEmail);
        const authorsWithEmails = await db
          .select({ value: count(sql`distinct ${authorEmail.authorId}`) })
          .from(authorEmail);
        console.log(
          `   📧 Email addresses collected: ${emailCount[0].value} (${authorsWithEmails[0].value} contributors)`
        );
      }
    }

    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.log(
      `\n✨ GitHub data fetch completed successfully in ${duration}s!`
    );
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`\n❌ Error in fetchAll after ${duration}s:`, error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  const fetchType = process.argv[2] || fetchTypes.top10;
  fetchAll(fetchType)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Command failed:", error);
      process.exit(1);
    });
}

export { fetchAll };
