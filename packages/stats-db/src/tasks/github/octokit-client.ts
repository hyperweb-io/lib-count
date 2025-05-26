import { Octokit } from "@octokit/rest";

export function createOctokitClient(token: string) {
  if (!token) {
    throw new Error("GitHub token is required");
  }

  const octokit = new Octokit({
    auth: token,
    userAgent: "hyperweb-github-fetcher",
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: {
          method: string;
          url: string;
          request: { retryCount: number };
        }
      ) => {
        console.log(
          `🚫 Rate limit exhausted for ${options.method} ${options.url}`
        );

        // Retry up to 2 times
        if (options.request.retryCount <= 2) {
          console.log(
            `⏳ Rate limit hit, waiting ${retryAfter} seconds before retry ${options.request.retryCount + 1}/3...`
          );
          return true;
        } else {
          console.log(
            `❌ Rate limit exceeded, max retries reached for ${options.method} ${options.url}`
          );
          return false;
        }
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: {
          method: string;
          url: string;
          request: { retryCount: number };
        }
      ) => {
        console.log(
          `⚠️  Secondary rate limit detected for ${options.method} ${options.url}`
        );
        console.log(
          `⚠️  Secondary rate limit hit for ${options.method} ${options.url}, waiting ${retryAfter} seconds...`
        );

        // Retry once for secondary rate limits
        if (options.request.retryCount === 0) {
          console.log(
            `⏳ Retrying after secondary rate limit in ${retryAfter} seconds...`
          );
          return true;
        }
        return false;
      },
    },
  });

  return octokit;
}

// Helper function to check rate limit status
export async function checkRateLimit(octokit: Octokit): Promise<{
  core: { limit: number; remaining: number; reset: Date };
  search: { limit: number; remaining: number; reset: Date };
  graphql: { limit: number; remaining: number; reset: Date };
}> {
  try {
    const { data } = await octokit.rest.rateLimit.get();

    return {
      core: {
        limit: data.resources.core.limit,
        remaining: data.resources.core.remaining,
        reset: new Date(data.resources.core.reset * 1000),
      },
      search: {
        limit: data.resources.search.limit,
        remaining: data.resources.search.remaining,
        reset: new Date(data.resources.search.reset * 1000),
      },
      graphql: {
        limit: data.resources.graphql.limit,
        remaining: data.resources.graphql.remaining,
        reset: new Date(data.resources.graphql.reset * 1000),
      },
    };
  } catch (error) {
    console.warn(
      "Failed to check rate limit:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

// Helper function to wait for rate limit reset
export async function waitForRateLimit(
  octokit: Octokit,
  type: "core" | "search" | "graphql" = "core"
): Promise<void> {
  try {
    const limits = await checkRateLimit(octokit);
    const limit = limits[type];

    if (limit.remaining < 10) {
      // Buffer of 10 requests
      const waitMs = Math.max(limit.reset.getTime() - Date.now(), 0) + 1000; // Add 1s buffer

      console.log(
        `⏳ ${type} rate limit low (${limit.remaining}/${limit.limit}). ` +
          `Waiting ${Math.ceil(waitMs / 1000)}s until ${limit.reset.toISOString()}`
      );

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  } catch (error) {
    console.warn(
      "Failed to check/wait for rate limit:",
      error instanceof Error ? error.message : String(error)
    );
    // Wait 60s as precaution if we can't check rate limit
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}

// Helper function to make API calls with automatic retry and rate limit handling
export async function makeApiCall<T>(
  octokit: Octokit,
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      if (
        lastError.message.includes("rate limit") ||
        lastError.message.includes("403")
      ) {
        console.log(
          `⏳ Rate limit hit on attempt ${attempt}/${maxRetries}, waiting before retry...`
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      // For non-rate-limit errors, don't retry
      if (
        attempt === 1 &&
        !lastError.message.includes("rate limit") &&
        !lastError.message.includes("403")
      ) {
        throw lastError;
      }

      // If we've exhausted retries, throw the last error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retrying other errors
      const delay = baseDelay * attempt;
      console.log(
        `⚠️  API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("API call failed after all retries");
}

// Export a default instance for convenience
export const defaultOctokit = createOctokitClient(
  process.env.GITHUB_TOKEN || ""
);
