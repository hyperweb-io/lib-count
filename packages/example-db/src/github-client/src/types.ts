export interface Repository {
  github_id: number;
  name: string;
  full_name: string;
  description: string | null;
  url: string;
  homepage_url: string | null;
  is_fork: boolean;
  fork_source_id?: number;
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
  size_kb: number;
  primary_language: string | null;
  created_at: Date;
  updated_at: Date;
  pushed_at: Date;
}

export interface Organization {
  github_id: number;
  login: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Author {
  github_id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Contribution {
  repository_id: string;
  author_id: string;
  contribution_type: "commit" | "issue" | "pull_request" | "review";
  count: number;
  first_contribution_at: Date;
  last_contribution_at: Date;
}
