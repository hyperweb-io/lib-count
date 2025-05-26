import "../../setup-env";
import { Database } from "@cosmology/db-client";
import { RestEndpointMethodTypes } from "@octokit/rest";
import * as queries from "./github.queries";
import { organizations, fetchTypes, knownForks } from "./data-config";
import { createOctokitClient, makeApiCall } from "./octokit-client";
import { detectRepositoryFork, ForkDetectionOptions } from "./fork-detection";

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
  client: any,
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

    // Get recent commits by this author
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

    // Extract emails from commit data
    for (const commit of commits) {
      if (commit.commit?.author?.email) {
        const email = commit.commit.author.email.toLowerCase().trim();

        // Skip invalid or placeholder emails
        if (
          email &&
          email !== "noreply@github.com" &&
          !email.includes("users.noreply.github.com") &&
          email.includes("@") &&
          email.length > 5
        ) {
          emailsFound.add(email);

          // Store the email with commit date
          await queries.insertOrUpdateAuthorEmail(client, {
            author_id: authorId,
            email: email,
            commit_date: new Date(commit.commit.author.date),
          });
        }
      }
    }

    if (emailsFound.size > 0) {
      console.log(
        `        📧 Found ${emailsFound.size} unique emails for ${authorLogin}: ${Array.from(emailsFound).join(", ")}`
      );

      // Update the author's primary email
      await queries.updateAuthorPrimaryEmail(client, authorId);
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

const octokit = createOctokitClient(GITHUB_TOKEN);

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
    const authorOrgs = await makeApiCall(octokit, () =>
      octokit.paginate(octokit.rest.orgs.listForUser, {
        username: login,
        per_page: 100,
      })
    );

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

async function fetchOrganizationData(
  client: any,
  org: string,
  fetchType: string
): Promise<void> {
  console.log(`\n📦 Processing organization: ${org}`);

  // 1. Insert/Update organization
  console.log(`  ⬇️  Fetching organization details...`);
  const { data: orgData } = await makeApiCall(octokit, () =>
    octokit.rest.orgs.get({ org })
  );

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

  let targetRepos =
    fetchType === fetchTypes.top10
      ? sortedRepos.slice(0, 10)
      : fetchType === fetchTypes.top3
        ? sortedRepos.slice(0, 3)
        : sortedRepos;

  // Apply fetch configuration limits
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

  // 3. Process repositories in smaller batches with delays
  let processedRepos = 0;
  for (let i = 0; i < targetRepos.length; i += FETCH_CONFIG.BATCH_SIZE) {
    const batch = targetRepos.slice(i, i + FETCH_CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(async (repo: Repository) => {
        try {
          console.log(`    📂 Processing ${repo.full_name}...`);

          // Robust fork detection using multiple methods
          console.log(`      🔍 Performing comprehensive fork analysis...`);

          const forkInfo = await detectRepositoryFork(
            octokit,
            org,
            repo.name,
            knownForks,
            FORK_DETECTION_CONFIG
          );

          // Update repository with fork information
          repo.is_fork = forkInfo.isFork;

          if (forkInfo.isFork) {
            console.log(
              `      📑 Fork detected! Method: ${forkInfo.detectionMethod}, Confidence: ${forkInfo.confidence}`
            );
            if (forkInfo.parentRepo) {
              console.log(`      📂 Parent: ${forkInfo.parentRepo}`);
            }
            if (
              forkInfo.sourceRepo &&
              forkInfo.sourceRepo !== forkInfo.parentRepo
            ) {
              console.log(`      🌟 Ultimate source: ${forkInfo.sourceRepo}`);
            }
            if (forkInfo.additionalInfo?.parentAccessible === false) {
              console.log(`      ⚠️  Parent repository not accessible`);
            }
          } else {
            console.log(
              `      ✅ Not a fork (confidence: ${forkInfo.confidence})`
            );
          }

          // Insert repository
          const { id: repoId } = await queries.insertRepository(client, {
            ...repo,
            is_fork: forkInfo.isFork,
            fork_date: forkInfo.forkDate,
            parent_repo: forkInfo.parentRepo,
            source_repo: forkInfo.sourceRepo,
            fork_detection_method: forkInfo.detectionMethod,
            fork_detection_confidence: forkInfo.confidence,
            owner_id: orgId,
          });

          // Fetch contributions (Requirement #6)
          console.log(`      📊 Fetching contributor statistics...`);

          if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
            console.log(
              `      🔍 Repository details: ${repo.full_name} (⭐${repo.stars_count}, 🍴${repo.forks_count})`
            );
          }

          let stats = (await makeApiCall(octokit, () =>
            octokit.paginate(octokit.rest.repos.getContributorsStats, {
              owner: org,
              repo: repo.name,
            })
          )) as ContributorStats;

          if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
            console.log(
              `      📈 GitHub API returned ${stats.length} contributors with stats`
            );
            if (stats.length > 0) {
              console.log(
                `      👥 Contributors found: ${stats.map((s) => s.author?.login || "unknown").join(", ")}`
              );
            }

            // Also check regular contributors API for comparison
            try {
              const regularContributors = await octokit.paginate(
                octokit.rest.repos.listContributors,
                {
                  owner: org,
                  repo: repo.name,
                  per_page: 10,
                }
              );
              console.log(
                `      🔍 Regular contributors API returned ${regularContributors.length} contributors`
              );
              if (regularContributors.length > 0) {
                console.log(
                  `      👥 Regular contributors: ${regularContributors
                    .map((c) => c.login)
                    .slice(0, 5)
                    .join(", ")}${regularContributors.length > 5 ? "..." : ""}`
                );
              }
            } catch (error) {
              console.log(
                `      ⚠️  Regular contributors API failed: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }

          // Filter out bots if enabled
          if (FETCH_CONFIG.FILTER_BOTS) {
            const originalCount = stats.length;
            stats = stats.filter(
              (stat) => stat.author && !isBot(stat.author.login)
            );
            const filteredCount = originalCount - stats.length;
            if (filteredCount > 0) {
              console.log(
                `      🤖 BOT FILTER: Filtered out ${filteredCount} bot contributors (${stats.length} remaining)`
              );
            }
          }

          // Apply fetch configuration limits for contributors
          if (FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO !== null) {
            const originalCount = stats.length;
            stats = stats.slice(0, FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO);
            console.log(
              `      🔧 FETCH LIMIT: Limited to ${FETCH_CONFIG.MAX_CONTRIBUTORS_PER_REPO} contributors (was ${originalCount})`
            );
          }

          let totalCommits = 0;

          if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
            console.log(
              `      👥 Processing ${stats.length} contributors for ${repo.full_name}`
            );
          }

          // Process contributors in parallel
          await Promise.all(
            stats.map(async (stat, index) => {
              if (!stat.author) return;

              if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
                console.log(
                  `        👤 Processing contributor ${index + 1}/${stats.length}: ${stat.author.login}`
                );
              }

              // Insert/Update author
              const { id: authorId } = await queries.insertAuthor(client, {
                github_id: stat.author.id,
                login: stat.author.login,
                name: undefined,
                avatar_url: stat.author.avatar_url,
              });

              if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
                console.log(
                  `        💾 Saved author: ${stat.author.login} (ID: ${authorId})`
                );
              }

              // Fetch all organizations this contributor belongs to
              await fetchContributorOrganizations(
                client,
                authorId,
                stat.author.login
              );

              // Sample commits to collect email addresses
              await sampleCommitsForEmails(
                client,
                authorId,
                stat.author.login,
                org,
                repo.name
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
            `      ✅ Processed repository with ${totalCommits} commits from ${stats.length} contributors`
          );

          if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
            console.log(`      📊 Repository summary for ${repo.full_name}:`);
            console.log(
              `         - Fork status: ${forkInfo.isFork ? "Yes" : "No"}${forkInfo.parentRepo ? ` (parent: ${forkInfo.parentRepo})` : ""}`
            );
            console.log(`         - Contributors processed: ${stats.length}`);
            console.log(`         - Total commits: ${totalCommits}`);
            console.log(
              `         - Stars: ${repo.stars_count}, Forks: ${repo.forks_count}`
            );
          }

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
    if (i + FETCH_CONFIG.BATCH_SIZE < targetRepos.length) {
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

    await db.withTransaction(async (client) => {
      // Clear existing data if configured
      if (FETCH_CONFIG.CLEAR_DATA_BEFORE_FETCH) {
        await queries.clearAllGitHubData(client);
      }

      for (let i = 0; i < organizations.length; i += FETCH_CONFIG.BATCH_SIZE) {
        const batch = organizations.slice(i, i + FETCH_CONFIG.BATCH_SIZE);
        await Promise.all(
          batch.map((org) => fetchOrganizationData(client, org, fetchType))
        );
      }

      // Generate final summary
      if (FETCH_CONFIG.ENABLE_DETAILED_LOGGING) {
        console.log("\n📊 FINAL COLLECTION SUMMARY:");

        // Count total organizations
        const orgCount = await client.query(
          "SELECT COUNT(*) FROM github.organization"
        );
        console.log(`   🏢 Organizations collected: ${orgCount.rows[0].count}`);

        // Count total repositories
        const repoCount = await client.query(
          "SELECT COUNT(*) FROM github.repository"
        );
        console.log(`   📂 Repositories collected: ${repoCount.rows[0].count}`);

        // Count total authors
        const authorCount = await client.query(
          "SELECT COUNT(*) FROM github.author"
        );
        console.log(
          `   👥 Contributors collected: ${authorCount.rows[0].count}`
        );

        // Count total contributions
        const contributionCount = await client.query(
          "SELECT COUNT(*) FROM github.daily_contribution"
        );
        console.log(
          `   📈 Daily contributions recorded: ${contributionCount.rows[0].count}`
        );

        // Count organization connections
        const connectionCount = await client.query(
          "SELECT COUNT(*) FROM github.organization_connection"
        );
        console.log(
          `   🔗 Organization connections: ${connectionCount.rows[0].count}`
        );

        // Count email addresses collected
        if (FETCH_CONFIG.SAMPLE_COMMITS_FOR_EMAILS) {
          const emailCount = await client.query(
            "SELECT COUNT(*) FROM github.author_email"
          );
          const authorsWithEmails = await client.query(
            "SELECT COUNT(DISTINCT author_id) FROM github.author_email"
          );
          console.log(
            `   📧 Email addresses collected: ${emailCount.rows[0].count} (${authorsWithEmails.rows[0].count} contributors)`
          );
        }
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

export { fetchAll };
