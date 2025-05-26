import { Octokit } from "@octokit/rest";
import { makeApiCall } from "./octokit-client";

export interface ForkInfo {
  isFork: boolean;
  parentRepo?: string;
  sourceRepo?: string; // Ultimate source if different from parent
  forkDate?: Date;
  detectionMethod:
    | "github_api"
    | "known_forks"
    | "commit_analysis"
    | "name_similarity"
    | "manual_verification";
  confidence: "high" | "medium" | "low";
  additionalInfo?: {
    parentExists?: boolean;
    parentAccessible?: boolean;
    sharedCommits?: number;
    nameMatch?: boolean;
  };
}

export interface ForkDetectionOptions {
  enableCommitAnalysis?: boolean;
  enableNameSimilarity?: boolean;
  maxCommitsToAnalyze?: number;
  similarityThreshold?: number;
}

export class ForkDetector {
  private octokit: Octokit;
  private knownForks: Record<string, string>;

  constructor(octokit: Octokit, knownForks: Record<string, string> = {}) {
    this.octokit = octokit;
    this.knownForks = knownForks;
  }

  /**
   * Comprehensive fork detection using multiple methods
   */
  async detectFork(
    owner: string,
    repo: string,
    options: ForkDetectionOptions = {}
  ): Promise<ForkInfo> {
    const fullName = `${owner}/${repo}`;

    console.log(`🔍 Analyzing fork status for ${fullName}...`);

    // Method 1: GitHub API (Primary and most reliable)
    const githubApiResult = await this.detectViaGitHubAPI(owner, repo);
    if (githubApiResult.isFork && githubApiResult.confidence === "high") {
      console.log(
        `  ✅ GitHub API confirms fork: ${githubApiResult.parentRepo}`
      );
      return githubApiResult;
    }

    // Method 2: Known forks list (Manual curation)
    const knownForkResult = this.detectViaKnownForks(fullName);
    if (knownForkResult.isFork) {
      console.log(`  ✅ Known fork detected: ${knownForkResult.parentRepo}`);
      return knownForkResult;
    }

    // Method 3: Commit analysis (if enabled and GitHub API was inconclusive)
    if (options.enableCommitAnalysis && githubApiResult.confidence !== "high") {
      const commitResult = await this.detectViaCommitAnalysis(
        owner,
        repo,
        options.maxCommitsToAnalyze || 10
      );
      if (commitResult.isFork) {
        console.log(
          `  ✅ Commit analysis suggests fork: ${commitResult.parentRepo}`
        );
        return commitResult;
      }
    }

    // Method 4: Name similarity analysis (if enabled)
    if (options.enableNameSimilarity) {
      const nameResult = await this.detectViaNameSimilarity(
        owner,
        repo,
        options.similarityThreshold || 0.8
      );
      if (nameResult.isFork) {
        console.log(
          `  ⚠️  Name similarity suggests possible fork: ${nameResult.parentRepo}`
        );
        return nameResult;
      }
    }

    // If GitHub API returned some info but with low confidence, return that
    if (githubApiResult.isFork) {
      console.log(`  ⚠️  GitHub API suggests fork but with low confidence`);
      return githubApiResult;
    }

    // Default: Not a fork
    console.log(`  ❌ No fork relationship detected`);
    return {
      isFork: false,
      detectionMethod: "github_api",
      confidence: "high",
    };
  }

  /**
   * Method 1: GitHub API detection (most reliable)
   */
  private async detectViaGitHubAPI(
    owner: string,
    repo: string
  ): Promise<ForkInfo> {
    try {
      const { data: repoData } = await makeApiCall(this.octokit, () =>
        this.octokit.rest.repos.get({ owner, repo })
      );

      if (!repoData.fork) {
        return {
          isFork: false,
          detectionMethod: "github_api",
          confidence: "high",
        };
      }

      // Repository is marked as fork
      let parentRepo = repoData.parent?.full_name;
      let sourceRepo = repoData.source?.full_name;
      let confidence: "high" | "medium" | "low" = "high";
      let parentExists = true;
      let parentAccessible = true;

      // Validate parent repository exists and is accessible
      if (parentRepo) {
        try {
          const [parentOwner, parentName] = parentRepo.split("/");
          await makeApiCall(this.octokit, () =>
            this.octokit.rest.repos.get({
              owner: parentOwner,
              repo: parentName,
            })
          );
        } catch (error) {
          console.log(`    ⚠️  Parent repository ${parentRepo} not accessible`);
          parentExists = false;
          parentAccessible = false;
          confidence = "medium";
        }
      } else {
        console.log(`    ⚠️  Fork marked but no parent information available`);
        confidence = "low";
      }

      // Try to get fork creation date
      let forkDate: Date | undefined;
      try {
        forkDate = new Date(repoData.created_at);
      } catch (error) {
        console.log(`    ⚠️  Could not parse fork creation date`);
      }

      return {
        isFork: true,
        parentRepo,
        sourceRepo: sourceRepo !== parentRepo ? sourceRepo : undefined,
        forkDate,
        detectionMethod: "github_api",
        confidence,
        additionalInfo: {
          parentExists,
          parentAccessible,
        },
      };
    } catch (error) {
      console.log(
        `    ❌ GitHub API error: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        isFork: false,
        detectionMethod: "github_api",
        confidence: "low",
      };
    }
  }

  /**
   * Method 2: Known forks detection (manual curation)
   */
  private detectViaKnownForks(fullName: string): ForkInfo {
    const parentRepo = this.knownForks[fullName];

    if (parentRepo) {
      return {
        isFork: true,
        parentRepo,
        detectionMethod: "known_forks",
        confidence: "high",
      };
    }

    return {
      isFork: false,
      detectionMethod: "known_forks",
      confidence: "high",
    };
  }

  /**
   * Method 3: Commit analysis detection
   * Analyzes recent commits to find shared history with potential parents
   */
  private async detectViaCommitAnalysis(
    owner: string,
    repo: string,
    maxCommits: number = 10
  ): Promise<ForkInfo> {
    try {
      console.log(`    🔍 Analyzing commits for fork detection...`);

      // Get recent commits
      const { data: commits } = await makeApiCall(this.octokit, () =>
        this.octokit.rest.repos.listCommits({
          owner,
          repo,
          per_page: maxCommits,
        })
      );

      if (commits.length === 0) {
        return {
          isFork: false,
          detectionMethod: "commit_analysis",
          confidence: "medium",
        };
      }

      // Look for commits that might indicate a fork
      // This is a simplified analysis - in practice, you'd want more sophisticated logic
      const firstCommit = commits[commits.length - 1];
      const commitMessage = firstCommit.commit.message.toLowerCase();

      // Check for common fork indicators in commit messages
      const forkIndicators = [
        "initial commit from",
        "forked from",
        "imported from",
        "copied from",
      ];

      for (const indicator of forkIndicators) {
        if (commitMessage.includes(indicator)) {
          console.log(`    ⚠️  Found fork indicator in commit: "${indicator}"`);
          return {
            isFork: true,
            detectionMethod: "commit_analysis",
            confidence: "medium",
            additionalInfo: {
              sharedCommits: commits.length,
            },
          };
        }
      }

      return {
        isFork: false,
        detectionMethod: "commit_analysis",
        confidence: "medium",
      };
    } catch (error) {
      console.log(
        `    ❌ Commit analysis error: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        isFork: false,
        detectionMethod: "commit_analysis",
        confidence: "low",
      };
    }
  }

  /**
   * Method 4: Name similarity detection
   * Searches for repositories with similar names that might be the parent
   */
  private async detectViaNameSimilarity(
    owner: string,
    repo: string,
    threshold: number = 0.8
  ): Promise<ForkInfo> {
    try {
      console.log(`    🔍 Searching for similar repository names...`);

      // Search for repositories with similar names
      const { data: searchResults } = await makeApiCall(this.octokit, () =>
        this.octokit.rest.search.repos({
          q: `${repo} in:name`,
          sort: "stars",
          order: "desc",
          per_page: 10,
        })
      );

      for (const result of searchResults.items) {
        if (result.full_name === `${owner}/${repo}`) continue;

        const similarity = this.calculateSimilarity(repo, result.name);
        if (similarity >= threshold && result.stargazers_count > 0) {
          console.log(
            `    ⚠️  Found similar repository: ${result.full_name} (similarity: ${similarity.toFixed(2)})`
          );

          return {
            isFork: true,
            parentRepo: result.full_name,
            detectionMethod: "name_similarity",
            confidence: "low",
            additionalInfo: {
              nameMatch: true,
            },
          };
        }
      }

      return {
        isFork: false,
        detectionMethod: "name_similarity",
        confidence: "medium",
      };
    } catch (error) {
      console.log(
        `    ❌ Name similarity search error: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        isFork: false,
        detectionMethod: "name_similarity",
        confidence: "low",
      };
    }
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Add a known fork to the manual list
   */
  addKnownFork(forkRepo: string, parentRepo: string): void {
    this.knownForks[forkRepo] = parentRepo;
  }

  /**
   * Get all known forks
   */
  getKnownForks(): Record<string, string> {
    return { ...this.knownForks };
  }
}

/**
 * Convenience function to create and use fork detector
 */
export async function detectRepositoryFork(
  octokit: Octokit,
  owner: string,
  repo: string,
  knownForks: Record<string, string> = {},
  options: ForkDetectionOptions = {}
): Promise<ForkInfo> {
  const detector = new ForkDetector(octokit, knownForks);
  return detector.detectFork(owner, repo, options);
}
