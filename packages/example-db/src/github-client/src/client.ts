import { Octokit } from "@octokit/rest";
import type { Repository, Organization, Author, Contribution } from "./types";

export class GitHubClient {
  private octokit: Octokit;

  constructor(authToken: string) {
    this.octokit = new Octokit({
      auth: authToken,
      userAgent: "github-data-fetcher v1.0",
      log: console,
    });
  }

  // Repository methods
  async fetchRepository(owner: string, repo: string): Promise<Repository> {
    const { data } = await this.octokit.rest.repos.get({
      owner,
      repo,
    });

    // Transform API response to match our schema
    return {
      github_id: data.id,
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      url: data.html_url,
      homepage_url: data.homepage,
      is_fork: data.fork,
      fork_source_id: data.parent?.id,
      stars_count: data.stargazers_count,
      forks_count: data.forks_count,
      open_issues_count: data.open_issues_count,
      size_kb: data.size,
      primary_language: data.language,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      pushed_at: new Date(data.pushed_at),
    };
  }

  // Organization methods
  async fetchOrganization(org: string): Promise<Organization> {
    const { data } = await this.octokit.rest.orgs.get({
      org,
    });

    return {
      github_id: data.id,
      login: data.login,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
    };
  }

  // Author (User) methods
  async fetchAuthor(username: string): Promise<Author> {
    const { data } = await this.octokit.rest.users.getByUsername({
      username,
    });

    return {
      github_id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
      bio: data.bio,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
    };
  }

  // Contribution methods with pagination
  async *fetchContributions(owner: string, repo: string) {
    for await (const response of this.octokit.paginate.iterator(
      this.octokit.rest.repos.listContributors,
      {
        owner,
        repo,
        per_page: 100,
      }
    )) {
      for (const contributor of response.data) {
        yield {
          author_login: contributor.login,
          count: contributor.contributions,
          // We'll need to fetch first/last contribution dates separately
          // as they're not available in the contributors API
        };
      }
    }
  }
}
