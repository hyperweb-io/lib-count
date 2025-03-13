import "../../setup-env";
import { Octokit } from "@octokit/rest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN environment variable is required");
}

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

// Add these interfaces for GraphQL response typing
interface CommitHistoryNode {
  oid: string;
  messageHeadline: string;
}

interface CommitHistoryResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history: {
          nodes: CommitHistoryNode[];
        };
      };
    };
  };
}

interface ForkResponse {
  isFork: boolean;
  parentRepo?: string;
  parentUrl?: string;
  commitComparison?: {
    isRelated: boolean;
    commonCommits: number;
    behindBy: number;
    aheadBy: number;
    sharedHistory?: {
      earliestCommonCommit?: {
        sha: string;
        date: string;
      };
    };
  };
}

// Add at the top with other interfaces
interface SearchRepoItem {
  id: number;
  name: string;
  owner: {
    login: string;
  };
  stargazers_count: number;
}

interface SearchResponse {
  data: {
    items: SearchRepoItem[];
  };
}

interface RepoResponse {
  data: {
    full_name: string;
    fork: boolean;
    stargazers_count: number;
    parent?: {
      full_name: string;
      html_url: string;
    };
    source?: {
      full_name: string;
    };
  };
}

// Add these interfaces at the top
interface RateLimitResponse {
  data: {
    resources: {
      core: {
        limit: number;
        remaining: number;
        reset: number;
      };
      search: {
        limit: number;
        remaining: number;
        reset: number;
      };
    };
  };
}

// Add rate limit checking function
async function checkRateLimit(type: "core" | "search"): Promise<void> {
  try {
    const { data } = (await octokit.rest.rateLimit.get()) as RateLimitResponse;
    const limit = data.resources[type];

    if (limit.remaining < 100) {
      // Buffer of 100 requests
      const resetTime = new Date(limit.reset * 1000);
      const waitMs = Math.max(resetTime.getTime() - Date.now(), 0) + 1000; // Add 1s buffer

      console.log(
        `⏳ ${type} Rate limit low (${limit.remaining}/${limit.limit}). ` +
          `Waiting ${Math.ceil(waitMs / 1000)}s until ${resetTime.toISOString()}`
      );

      await delay(waitMs);
    }
  } catch (error) {
    console.warn("Failed to check rate limit:", error);
    // Wait 60s as precaution if we can't check rate limit
    await delay(60000);
  }
}

async function getCommitHistory(
  owner: string,
  repo: string,
  since?: string
): Promise<Array<{ sha: string; date: string }>> {
  try {
    const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
      owner,
      repo,
      since,
      per_page: 100,
    });

    return commits.map((commit) => ({
      sha: commit.sha,
      date: commit.commit.committer?.date || commit.commit.author?.date || "",
    }));
  } catch (error) {
    console.warn(`Failed to get commit history for ${owner}/${repo}:`, error);
    return [];
  }
}

async function findCommonHistory(
  parentOwner: string,
  parentRepo: string,
  forkOwner: string,
  forkRepo: string
): Promise<{
  isRelated: boolean;
  commonCommits: number;
  behindBy: number;
  aheadBy: number;
  sharedHistory?: {
    earliestCommonCommit?: {
      sha: string;
      date: string;
    };
  };
}> {
  try {
    await checkRateLimit("core");
    // Get commit histories for both repos
    const [parentCommits, forkCommits] = await Promise.all([
      getCommitHistory(parentOwner, parentRepo),
      getCommitHistory(forkOwner, forkRepo),
    ]);

    // Create a map of parent commit SHAs for faster lookup
    const parentCommitMap = new Map(
      parentCommits.map((commit) => [commit.sha, commit])
    );

    // Find common commits
    const commonCommits = forkCommits.filter((commit) =>
      parentCommitMap.has(commit.sha)
    );

    if (commonCommits.length > 0) {
      // Sort common commits by date to find the earliest
      const sortedCommonCommits = commonCommits.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return {
        isRelated: true,
        commonCommits: commonCommits.length,
        behindBy: parentCommits.length - commonCommits.length,
        aheadBy: forkCommits.length - commonCommits.length,
        sharedHistory: {
          earliestCommonCommit: sortedCommonCommits[0],
        },
      };
    }

    // If no direct commits match, try comparing with the GraphQL API
    const query = `
      query($owner:String!, $repo:String!) {
        repository(owner:$owner, name:$repo) {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 100) {
                  nodes {
                    oid
                    messageHeadline
                  }
                }
              }
            }
          }
        }
      }
    `;

    const [parentData, forkData] = await Promise.all([
      octokit.graphql<CommitHistoryResponse>(query, {
        owner: parentOwner,
        repo: parentRepo,
      }),
      octokit.graphql<CommitHistoryResponse>(query, {
        owner: forkOwner,
        repo: forkRepo,
      }),
    ]);

    // Compare commit messages for similarity
    const parentMessages =
      parentData.repository.defaultBranchRef.target.history.nodes.map(
        (n: CommitHistoryNode) => n.messageHeadline
      );
    const forkMessages =
      forkData.repository.defaultBranchRef.target.history.nodes.map(
        (n: CommitHistoryNode) => n.messageHeadline
      );

    const similarMessages = parentMessages.filter((msg) =>
      forkMessages.some((fMsg) => fMsg === msg)
    );

    return {
      isRelated: similarMessages.length > 5, // Consider related if more than 5 similar commit messages
      commonCommits: similarMessages.length,
      behindBy: parentMessages.length - similarMessages.length,
      aheadBy: forkMessages.length - similarMessages.length,
    };
  } catch (error) {
    console.warn("Failed to find common history:", error);
    return {
      isRelated: false,
      commonCommits: 0,
      behindBy: 0,
      aheadBy: 0,
    };
  }
}

async function findPotentialParents(
  repoName: string
): Promise<Array<{ owner: string; repo: string }>> {
  try {
    await checkRateLimit("search");
    const searchQuery = repoName.split("/")[1];
    const { data } = (await octokit.rest.search.repos({
      q: `${searchQuery} in:name fork:false sort:stars`,
      sort: "stars",
      order: "desc",
      per_page: 5,
    })) as SearchResponse;

    await checkRateLimit("core");
    const currentRepo = (await octokit.rest.repos.get({
      owner: repoName.split("/")[0],
      repo: searchQuery,
    })) as RepoResponse;

    return data.items
      .filter(
        (repo) =>
          repo.stargazers_count > (currentRepo.data.stargazers_count || 0)
      )
      .map((repo) => ({
        owner: repo.owner.login,
        repo: repo.name,
      }));
  } catch (error) {
    console.warn("Failed to find potential parents:", error);
    return [];
  }
}

async function findUnofficialForks(
  owner: string,
  repo: string
): Promise<Array<{ owner: string; repo: string }>> {
  try {
    await checkRateLimit("core");
    // Get repository network (forks)
    const { data: networkData } = await octokit.rest.repos.listForks({
      owner,
      repo,
      sort: "stargazers",
      per_page: 5,
    });

    await checkRateLimit("search");
    // Get repository network through search API as well
    const { data: searchData } = (await octokit.rest.search.repos({
      q: `${repo} in:name fork:true sort:stars`,
      sort: "stars",
      order: "desc",
      per_page: 5,
    })) as SearchResponse;

    // Combine results from both sources
    const allForks = new Map<string, { owner: string; repo: string }>();

    // Add forks from network (already sorted by stars)
    networkData.forEach((fork) => {
      allForks.set(fork.full_name, {
        owner: fork.owner.login,
        repo: fork.name,
      });
    });

    // Add top forks from search
    searchData.items.forEach((item) => {
      allForks.set(`${item.owner.login}/${item.name}`, {
        owner: item.owner.login,
        repo: item.name,
      });
    });

    // Return only top 5 unique forks
    return Array.from(allForks.values()).slice(0, 5);
  } catch (error) {
    console.warn("Failed to find unofficial forks:", error);
    return [];
  }
}

async function isRepositoryAFork(
  owner: string,
  repo: string
): Promise<ForkResponse> {
  try {
    await checkRateLimit("core");
    const response = (await octokit.rest.repos.get({
      owner,
      repo,
    })) as RepoResponse;

    const repoData = response.data;
    console.log("Repository data:", {
      name: repoData.full_name,
      isFork: repoData.fork,
      parent: repoData.parent?.full_name,
      source: repoData.source?.full_name,
    });

    if (repoData.fork && repoData.parent) {
      const [parentOwner, parentRepo] = repoData.parent.full_name.split("/");
      const comparison = await findCommonHistory(
        parentOwner,
        parentRepo,
        owner,
        repo
      );

      return {
        isFork: true,
        parentRepo: repoData.parent.full_name,
        parentUrl: repoData.parent.html_url,
        commitComparison: comparison,
      };
    }

    // If not marked as fork, find and check potential parents
    console.log("Searching for potential parent repositories...");
    const potentialParents = await findPotentialParents(`${owner}/${repo}`);
    console.log("Found potential parents:", potentialParents);

    for (const parent of potentialParents) {
      console.log(`Checking potential parent: ${parent.owner}/${parent.repo}`);
      const comparison = await findCommonHistory(
        parent.owner,
        parent.repo,
        owner,
        repo
      );

      if (comparison.isRelated) {
        return {
          isFork: true,
          parentRepo: `${parent.owner}/${parent.repo}`,
          parentUrl: `https://github.com/${parent.owner}/${parent.repo}`,
          commitComparison: comparison,
        };
      }
    }

    // Check for unofficial forks in the repository network
    console.log("Searching for unofficial forks...");
    const unofficialForks = await findUnofficialForks(owner, repo);
    console.log("Found unofficial forks:", unofficialForks);

    for (const fork of unofficialForks) {
      console.log(`Checking unofficial fork: ${fork.owner}/${fork.repo}`);
      const comparison = await findCommonHistory(
        fork.owner,
        fork.repo,
        owner,
        repo
      );

      if (comparison.isRelated) {
        return {
          isFork: true,
          parentRepo: `${fork.owner}/${fork.repo}`,
          parentUrl: `https://github.com/${fork.owner}/${fork.repo}`,
          commitComparison: comparison,
        };
      }
    }

    return { isFork: false };
  } catch (error) {
    console.error("Error checking repository fork status:", error);
    throw error;
  }
}

async function checkFork(repoName: string): Promise<void> {
  console.log(`\nChecking fork status for ${repoName}...`);
  const [owner, repo] = repoName.split("/");
  const result = await isRepositoryAFork(owner, repo);
  console.log("Fork analysis result:", JSON.stringify(result, null, 2));
}

// Test multiple repositories
async function runTests() {
  const repos = [
    "hyperweb-io/protobuf.js",
    // "protobufjs/protobuf.js", // Original repo for comparison
    "hyperweb-io/mitosis", // Another potential fork
  ];

  for (const repo of repos) {
    await checkFork(repo);
  }
}

runTests().catch(console.error);

export { isRepositoryAFork, findCommonHistory };

// Add delay helper
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
