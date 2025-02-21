import "../../setup-env";
import { Database } from "@cosmology/db-client";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import * as queries from "./github.queries";
import { organizations, fetchTypes, knownForks } from "./data-config";
import { findCommonHistory, isRepositoryAFork } from "./analyze-repo";

const BATCH_SIZE = 5; // Reduced from 100 to 5 for better rate limit handling
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
  github_id: number;
  name: string;
  full_name: string;
  description?: string;
  url: string;
  is_fork: boolean;
  fork_date?: string | Date; // Allow both string and Date
  stars_count: number;
  forks_count: number;
  commits_count: number;
  primary_language?: string;
  owner_id?: string;
};

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  userAgent: "hyperweb-github-fetcher",
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: { method: string; url: string }
    ) => {
      console.warn(
        `Rate limit hit for ${options.method} ${options.url}, waiting ${retryAfter} seconds`
      );
      return retryAfter <= 60;
    },
    onSecondaryRateLimit: (
      retryAfter: number,
      options: { method: string; url: string }
    ) => {
      console.warn(
        `Secondary rate limit hit for ${options.method} ${options.url}, waiting ${retryAfter} seconds`
      );
      return true;
    },
  },
});

// Add delay helper
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchContributorOrganizations(
  client: any,
  authorId: string,
  login: string
): Promise<void> {
  console.log(`      🔍 Fetching organizations for contributor ${login}...`);

  try {
    // Get all organizations the contributor belongs to using pagination
    const authorOrgs = await octokit.paginate(octokit.rest.orgs.listForUser, {
      username: login,
      per_page: 100,
    });

    // Process each organization
    for (const org of authorOrgs) {
      // Insert the organization if it doesn't exist
      const { id: orgId } = await queries.insertOrganization(client, {
        github_id: org.id,
        login: org.login,
        name: org.login || undefined,
        description: org.description || undefined,
        avatar_url: org.avatar_url,
      });

      // Add to author organization history
      await queries.updateAuthorOrgHistory(client, {
        author_id: authorId,
        organization_id: orgId,
        joined_at: new Date(), // Using current date as we don't have the actual join date
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

async function isKnownFork(
  fullName: string
): Promise<{ isFork: boolean; parentRepo?: string }> {
  const parentRepo = knownForks[fullName as keyof typeof knownForks];
  return parentRepo ? { isFork: true, parentRepo } : { isFork: false };
}

async function fetchOrganizationData(
  client: any,
  org: string,
  fetchType: string
): Promise<void> {
  console.log(`\n📦 Processing organization: ${org}`);

  // 1. Insert/Update organization
  console.log(`  ⬇️  Fetching organization details...`);
  const { data: orgData } = await octokit.rest.orgs.get({ org });

  const { id: orgId } = await queries.insertOrganization(client, {
    github_id: orgData.id,
    login: orgData.login,
    name: orgData.name || undefined,
    description: orgData.description || undefined,
    avatar_url: orgData.avatar_url,
  });
  console.log(`  ✅ Organization details saved`);

  // 2. Fetch repositories
  console.log(`  ⬇️  Fetching repositories...`);
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    type: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });
  console.log(`  📊 Found ${repos.length} repositories`);

  // Update the repository mapping to use our type
  const sortedRepos = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .map(
      (repo: OrgRepo): Repository => ({
        github_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        is_fork: repo.fork,
        stars_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        commits_count: 0,
        primary_language: repo.language,
      })
    );

  const targetRepos =
    fetchType === fetchTypes.top10
      ? sortedRepos.slice(0, 10)
      : fetchType === fetchTypes.top3
        ? sortedRepos.slice(0, 3)
        : sortedRepos;

  console.log(
    `  🎯 Processing ${targetRepos.length} repositories (${
      fetchType === fetchTypes.top10
        ? "top 10"
        : fetchType === fetchTypes.top3
          ? "top 3"
          : "all"
    })`
  );

  // 3. Process repositories in smaller batches with delays
  let processedRepos = 0;
  for (let i = 0; i < targetRepos.length; i += BATCH_SIZE) {
    const batch = targetRepos.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (repo: Repository) => {
        try {
          console.log(`    📂 Processing ${repo.full_name}...`);

          // Simplified fork detection
          console.log(`      🔍 Checking fork status...`);

          // First check GitHub API metadata
          const { data: repoData } = await octokit.rest.repos.get({
            owner: org,
            repo: repo.name,
          });

          let isFork = repoData.fork;
          let parentRepo = repoData.parent?.full_name;
          let forkDate: Date | undefined;

          // If not marked as fork by GitHub, check whitelist
          if (!isFork) {
            const knownForkInfo = await isKnownFork(repo.full_name);
            isFork = knownForkInfo.isFork;
            parentRepo = knownForkInfo.parentRepo;
          }

          if (isFork) {
            console.log(`      📑 Fork detected! Parent: ${parentRepo}`);
            repo.is_fork = true;

            // Get fork date from first commit if available
            try {
              const { data: commits } = await octokit.rest.repos.listCommits({
                owner: org,
                repo: repo.name,
                per_page: 1,
              });
              forkDate = commits[0]?.commit.committer?.date
                ? new Date(commits[0].commit.committer.date)
                : undefined;
            } catch (error) {
              console.warn(`      ⚠️  Failed to get fork date`);
            }
          }

          // Insert repository
          const { id: repoId } = await queries.insertRepository(client, {
            ...repo,
            is_fork: isFork,
            fork_date: forkDate,
            owner_id: orgId,
          });

          // Fetch contributions (Requirement #6)
          console.log(`      📊 Fetching contributor statistics...`);
          const stats = (await octokit.paginate(
            octokit.rest.repos.getContributorsStats,
            {
              owner: org,
              repo: repo.name,
            }
          )) as ContributorStats;

          let totalCommits = 0;

          // Process contributors in parallel
          await Promise.all(
            stats.map(async (stat) => {
              if (!stat.author) return;

              // Insert/Update author
              const { id: authorId } = await queries.insertAuthor(client, {
                github_id: stat.author.id,
                login: stat.author.login,
                name: undefined,
                avatar_url: stat.author.avatar_url,
              });

              // Fetch all organizations this contributor belongs to
              await fetchContributorOrganizations(
                client,
                authorId,
                stat.author.login
              );

              // Process weekly contributions
              for (const week of stat.weeks) {
                if (
                  !repo.is_fork ||
                  new Date(week.w * 1000) >= new Date(repo.fork_date || 0)
                ) {
                  totalCommits += week.c;

                  // Store daily contributions
                  await queries.insertDailyContribution(client, {
                    repository_id: repoId,
                    author_id: authorId,
                    date: new Date(week.w * 1000),
                    commits: week.c,
                    additions: week.a,
                    deletions: week.d,
                  });

                  // Track author organization history (Requirement #7)
                  if (week.c > 0) {
                    await queries.updateAuthorOrgHistory(client, {
                      author_id: authorId,
                      organization_id: orgId,
                      joined_at: new Date(week.w * 1000),
                    });
                  }
                }
              }

              // Update contribution summary for this author and organization
              await updateContributionSummary(client, authorId, orgId);
            })
          );

          // Update repository commit count
          await client.query(
            "UPDATE github.repository SET commits_count = $1 WHERE id = $2",
            [totalCommits, repoId]
          );

          processedRepos++;
          console.log(
            `      ✅ Processed repository with ${totalCommits} commits`
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
            await delay(60000); // Wait 60 seconds on rate limit
            throw error; // Retry the operation
          }
          throw error;
        }
      })
    );

    // Add delay between batches
    if (i + BATCH_SIZE < targetRepos.length) {
      console.log(`    ⏳ Waiting between batches...`);
      await delay(5000); // 5 seconds between batches
    }
  }

  // 4. Update organization connections with enhanced query
  console.log(`  🔄 Updating organization connections...`);
  await client.query(
    `
    WITH contributor_orgs AS (
      SELECT DISTINCT
        aoh.organization_id as org_id,
        aoh.author_id
      FROM github.author_organization_history aoh
    ),
    context_org_contributors AS (
      -- Get contributors who have commits in our context organizations
      SELECT DISTINCT dc.author_id
      FROM github.daily_contribution dc
      JOIN github.repository r ON r.id = dc.repository_id
      JOIN github.organization o ON o.id = r.owner_id
      WHERE o.is_active = true  -- Only our seeding orgs are active
      AND dc.commits > 0
    )
    INSERT INTO github.organization_connection (
      source_org_id, target_org_id, shared_contributors, last_analyzed_at
    )
    SELECT 
      $1 as source_org_id,
      o.id as target_org_id,
      COUNT(DISTINCT co1.author_id) as shared_contributors,
      NOW() as last_analyzed_at
    FROM github.organization o
    JOIN contributor_orgs co1 ON co1.org_id = o.id
    JOIN context_org_contributors coc ON coc.author_id = co1.author_id
    WHERE o.id != $1
    GROUP BY o.id
    ON CONFLICT (source_org_id, target_org_id) 
    DO UPDATE SET 
      shared_contributors = EXCLUDED.shared_contributors,
      last_analyzed_at = EXCLUDED.last_analyzed_at,
      updated_at = NOW()
    `,
    [orgId]
  );

  console.log(`✅ Completed processing organization: ${org}\n`);
}

// Add this helper function to update contribution summaries
async function updateContributionSummary(
  client: any,
  authorId: string,
  organizationId: string
): Promise<void> {
  await client.query(
    `
    INSERT INTO github.contribution_summary (
      author_id, organization_id,
      total_commits, first_contribution_at, last_contribution_at
    )
    SELECT 
      dc.author_id,
      r.owner_id as organization_id,
      SUM(dc.commits) as total_commits,
      MIN(dc.date) as first_contribution_at,
      MAX(dc.date) as last_contribution_at
    FROM github.daily_contribution dc
    JOIN github.repository r ON r.id = dc.repository_id
    WHERE dc.author_id = $1 AND r.owner_id = $2
    GROUP BY dc.author_id, r.owner_id
    ON CONFLICT (author_id, organization_id) DO UPDATE SET
      total_commits = EXCLUDED.total_commits,
      first_contribution_at = EXCLUDED.first_contribution_at,
      last_contribution_at = EXCLUDED.last_contribution_at,
      updated_at = NOW()
    `,
    [authorId, organizationId]
  );
}

async function fetchAll(fetchType = fetchTypes.top10): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    console.log("\n🚀 Starting GitHub data fetch...");
    console.log(`📋 Fetch type: ${fetchType}`);
    console.log(`🎯 Target organizations: ${organizations.join(", ")}\n`);

    await db.withTransaction(async (client) => {
      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((org) => fetchOrganizationData(client, org, fetchType))
        );
      }
    });

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

export { fetchAll, isRepositoryAFork, findCommonHistory };
