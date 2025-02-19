import { PoolClient } from "pg";

// Organization queries
export async function insertOrganization(
  client: any,
  org: {
    github_id: number;
    login: string;
    name?: string;
    description?: string;
    avatar_url?: string;
    is_active?: boolean;
  }
): Promise<{ id: string }> {
  const result = await client.query(
    `
    INSERT INTO github.organization (
      github_id, login, name, description, avatar_url, is_active,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (github_id) DO UPDATE SET
      login = EXCLUDED.login,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      avatar_url = EXCLUDED.avatar_url,
      is_active = COALESCE(EXCLUDED.is_active, github.organization.is_active),
      updated_at = NOW()
    RETURNING id
    `,
    [
      org.github_id,
      org.login,
      org.name,
      org.description,
      org.avatar_url,
      org.is_active ?? true,
    ]
  );
  return result.rows[0];
}

// Author queries
export async function insertAuthor(
  client: any,
  author: {
    github_id: number;
    login: string;
    name?: string;
    avatar_url?: string;
  }
): Promise<{ id: string }> {
  const result = await client.query(
    `
    INSERT INTO github.author (
      github_id, login, name, avatar_url,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (github_id) DO UPDATE SET
      login = EXCLUDED.login,
      name = COALESCE(EXCLUDED.name, github.author.name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, github.author.avatar_url),
      updated_at = NOW()
    RETURNING id
    `,
    [author.github_id, author.login, author.name, author.avatar_url]
  );
  return result.rows[0];
}

// Repository queries
export async function insertRepository(
  client: any,
  repo: {
    github_id: number;
    name: string;
    full_name: string;
    description?: string;
    url: string;
    is_fork: boolean;
    fork_date?: string | Date;
    owner_id: string;
    stars_count: number;
    forks_count: number;
    commits_count: number;
    primary_language?: string;
  }
): Promise<{ id: string }> {
  const result = await client.query(
    `
    INSERT INTO github.repository (
      github_id, name, full_name, description, url,
      is_fork, fork_date, owner_id, stars_count, forks_count,
      commits_count, primary_language, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    ON CONFLICT (github_id) DO UPDATE SET
      name = EXCLUDED.name,
      full_name = EXCLUDED.full_name,
      description = EXCLUDED.description,
      url = EXCLUDED.url,
      is_fork = EXCLUDED.is_fork,
      fork_date = COALESCE(EXCLUDED.fork_date, github.repository.fork_date),
      owner_id = EXCLUDED.owner_id,
      stars_count = EXCLUDED.stars_count,
      forks_count = EXCLUDED.forks_count,
      commits_count = EXCLUDED.commits_count,
      primary_language = EXCLUDED.primary_language,
      updated_at = NOW()
    RETURNING id
    `,
    [
      repo.github_id,
      repo.name,
      repo.full_name,
      repo.description,
      repo.url,
      repo.is_fork,
      repo.fork_date ? new Date(repo.fork_date) : null,
      repo.owner_id,
      repo.stars_count,
      repo.forks_count,
      repo.commits_count,
      repo.primary_language,
    ]
  );
  return result.rows[0];
}

// Daily contribution queries
export async function insertDailyContribution(
  client: any,
  contribution: {
    repository_id: string;
    author_id: string;
    date: Date;
    commits: number;
    additions: number;
    deletions: number;
  }
): Promise<void> {
  await client.query(
    `
    INSERT INTO github.daily_contribution (
      repository_id, author_id, date, commits,
      additions, deletions
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (repository_id, author_id, date) DO UPDATE SET
      commits = EXCLUDED.commits,
      additions = EXCLUDED.additions,
      deletions = EXCLUDED.deletions
    `,
    [
      contribution.repository_id,
      contribution.author_id,
      contribution.date,
      contribution.commits,
      contribution.additions,
      contribution.deletions,
    ]
  );
}

// Author organization history
export async function updateAuthorOrgHistory(
  client: any,
  data: {
    author_id: string;
    organization_id: string;
    joined_at: Date;
  }
): Promise<void> {
  await client.query(
    `
    INSERT INTO github.author_organization_history (
      author_id, organization_id, joined_at,
      created_at
    )
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (author_id, organization_id, joined_at) DO NOTHING
    `,
    [data.author_id, data.organization_id, data.joined_at]
  );
}

// Contribution summary
export async function updateContributionSummary(
  client: any,
  data: {
    author_id: string;
    organization_id: string;
    total_commits: number;
    first_contribution_at: Date;
    last_contribution_at: Date;
  }
): Promise<void> {
  await client.query(
    `
    INSERT INTO github.contribution_summary (
      author_id, organization_id, total_commits,
      first_contribution_at, last_contribution_at,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (author_id, organization_id) DO UPDATE SET
      total_commits = EXCLUDED.total_commits,
      first_contribution_at = LEAST(EXCLUDED.first_contribution_at, github.contribution_summary.first_contribution_at),
      last_contribution_at = GREATEST(EXCLUDED.last_contribution_at, github.contribution_summary.last_contribution_at),
      updated_at = NOW()
    `,
    [
      data.author_id,
      data.organization_id,
      data.total_commits,
      data.first_contribution_at,
      data.last_contribution_at,
    ]
  );
}

// Whitelist/Blacklist operations
export async function setOrganizationActive(
  client: PoolClient,
  orgId: string,
  isActive: boolean
): Promise<void> {
  await client.query(
    `
    UPDATE github.organization
    SET is_active = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [orgId, isActive]
  );
}

// Organization connections
export async function updateOrgConnection(
  client: PoolClient,
  data: {
    source_org_id: string;
    target_org_id: string;
    connection_strength: number;
    shared_contributors: number;
  }
): Promise<void> {
  await client.query(
    `
    INSERT INTO github.organization_connection (
      source_org_id, target_org_id, connection_strength,
      shared_contributors, last_analyzed_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (source_org_id, target_org_id) DO UPDATE SET
      connection_strength = EXCLUDED.connection_strength,
      shared_contributors = EXCLUDED.shared_contributors,
      last_analyzed_at = NOW(),
      updated_at = NOW()
    `,
    [
      data.source_org_id,
      data.target_org_id,
      data.connection_strength,
      data.shared_contributors,
    ]
  );
}

// Analysis queries
export async function getAuthorOrgTimeline(
  client: PoolClient,
  authorId?: string
): Promise<
  {
    login: string;
    orgTimeline: {
      orgName: string;
      firstContribution: Date;
      lastContribution: Date;
    }[];
  }[]
> {
  const result = await client.query(
    `
    SELECT 
      a.login,
      jsonb_agg(
        jsonb_build_object(
          'orgName', o.login,
          'firstContribution', MIN(dc.date),
          'lastContribution', MAX(dc.date)
        )
        ORDER BY MIN(dc.date)
      ) as org_timeline
    FROM github.author a
    JOIN github.daily_contribution dc ON dc.author_id = a.id
    JOIN github.repository r ON r.id = dc.repository_id
    JOIN github.organization o ON o.id = r.owner_id
    WHERE r.owner_type = 'organization'
    ${authorId ? "AND a.id = $1" : ""}
    GROUP BY a.login
    ORDER BY a.login
    `,
    authorId ? [authorId] : []
  );
  return result.rows.map((row) => ({
    login: row.login,
    orgTimeline: row.org_timeline,
  }));
}
export async function getOrgContributors(
  client: PoolClient,
  orgId: string
): Promise<
  {
    id: string;
    login: string;
    name: string | null;
    repos_contributed: number;
    total_commits: number;
    first_contribution: Date;
    last_contribution: Date;
  }[]
> {
  const result = await client.query(
    `
    WITH org_repos AS (
      SELECT id FROM github.repository
      WHERE owner_id = $1 AND owner_type = 'organization'
    )
    SELECT DISTINCT
      a.id,
      a.login,
      a.name,
      COUNT(DISTINCT dc.repository_id) as repos_contributed,
      SUM(dc.commits_count) as total_commits,
      MIN(dc.date) as first_contribution,
      MAX(dc.date) as last_contribution
    FROM github.author a
    JOIN github.daily_contribution dc ON dc.author_id = a.id
    WHERE dc.repository_id IN (SELECT id FROM org_repos)
    GROUP BY a.id, a.login, a.name
    ORDER BY total_commits DESC
    `,
    [orgId]
  );
  return result.rows;
}

export async function getInterOrgConnections(
  client: PoolClient,
  minSharedContributors = 1
): Promise<
  {
    sourceOrg: string;
    targetOrg: string;
    sharedContributors: number;
    connectionStrength: number;
  }[]
> {
  const result = await client.query(
    `
    SELECT 
      src.login as source_org,
      tgt.login as target_org,
      oc.shared_contributors,
      oc.connection_strength
    FROM github.organization_connection oc
    JOIN github.organization src ON src.id = oc.source_org_id
    JOIN github.organization tgt ON tgt.id = oc.target_org_id
    WHERE oc.shared_contributors >= $1
    ORDER BY oc.shared_contributors DESC, oc.connection_strength DESC
    `,
    [minSharedContributors]
  );
  return result.rows;
}

// Get repositories by organization with fork details
export async function getOrgRepositories(
  client: PoolClient,
  orgId: string,
  includeInactive = false
): Promise<
  {
    id: string;
    name: string;
    full_name: string;
    description: string | null;
    url: string;
    homepage_url: string | null;
    is_fork: boolean;
    fork_source_id: string | null;
    fork_date: Date | null;
    fork_owner_id: string | null;
    fork_owner_type: string | null;
    owner_id: string;
    owner_type: string;
    stars_count: number;
    forks_count: number;
    open_issues_count: number;
    pull_requests_count: number;
    commits_count: number;
    size_kb: number;
    primary_language: string | null;
    languages: Record<string, number> | null;
    topics: string[];
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    pushed_at: Date;
  }[]
> {
  const result = await client.query(
    `
    SELECT *
    FROM github.repository r
    WHERE r.owner_id = $1 
    AND r.owner_type = 'organization'
    AND (r.is_active = true OR $2 = true)
    ORDER BY r.stars_count DESC
    `,
    [orgId, includeInactive]
  );
  return result.rows;
}

// Get contributions filtered by date
export async function getContributionsAfterDate(
  client: PoolClient,
  repositoryId: string,
  afterDate: Date
): Promise<
  {
    id: string;
    repository_id: string;
    author_id: string;
    date: Date;
    commits_count: number;
    additions: number;
    deletions: number;
    changed_files: number;
    author_login: string;
    author_name: string | null;
  }[]
> {
  const result = await client.query(
    `
    SELECT 
      dc.*,
      a.login as author_login,
      a.name as author_name
    FROM github.daily_contribution dc
    JOIN github.author a ON a.id = dc.author_id
    WHERE dc.repository_id = $1
    AND dc.date >= $2
    ORDER BY dc.date ASC
    `,
    [repositoryId, afterDate]
  );
  return result.rows;
}

// Get author's contributions to context organizations
export async function getAuthorContextOrgContributions(
  client: PoolClient,
  authorId: string
): Promise<
  {
    org_name: string;
    repo_name: string;
    is_fork: boolean;
    is_fork_of_context_org: boolean;
    commits: number;
    additions: number;
    deletions: number;
    first_contribution_date: Date;
    last_contribution_date: Date;
  }[]
> {
  const result = await client.query(
    `
    WITH context_orgs AS (
      SELECT id FROM github.organization WHERE is_active = true
    )
    SELECT 
      o.login as org_name,
      r.name as repo_name,
      r.is_fork,
      r.is_fork_of_context_org,
      SUM(dc.commits_count) as commits,
      SUM(dc.additions) as additions,
      SUM(dc.deletions) as deletions,
      MIN(dc.date) as first_contribution_date,
      MAX(dc.date) as last_contribution_date
    FROM github.daily_contribution dc
    JOIN github.repository r ON r.id = dc.repository_id
    JOIN github.organization o ON o.id = r.owner_id
    WHERE dc.author_id = $1
    AND r.owner_type = 'organization'
    AND r.owner_id IN (SELECT id FROM context_orgs)
    GROUP BY o.login, r.name, r.is_fork, r.is_fork_of_context_org
    ORDER BY o.login, last_contribution_date DESC
    `,
    [authorId]
  );
  return result.rows;
}

// Get organization's contributors from other context organizations
export async function getOrgContributorsFromContextOrgs(
  client: PoolClient,
  orgId: string,
  minContributions = 1
): Promise<
  {
    author_login: string;
    author_name: string | null;
    other_org: string;
    repos_contributed: number;
    total_commits: number;
  }[]
> {
  const result = await client.query(
    `
    WITH context_orgs AS (
      SELECT id FROM github.organization 
      WHERE is_active = true AND id != $1
    ),
    org_contributors AS (
      SELECT DISTINCT dc.author_id
      FROM github.daily_contribution dc
      JOIN github.repository r ON r.id = dc.repository_id
      WHERE r.owner_id = $1
      AND r.owner_type = 'organization'
      GROUP BY dc.author_id
      HAVING SUM(dc.commits_count) >= $2
    )
    SELECT 
      a.login as author_login,
      a.name as author_name,
      o.login as other_org,
      COUNT(DISTINCT r.id) as repos_contributed,
      SUM(dc.commits_count) as total_commits
    FROM org_contributors oc
    JOIN github.author a ON a.id = oc.author_id
    JOIN github.daily_contribution dc ON dc.author_id = a.id
    JOIN github.repository r ON r.id = dc.repository_id
    JOIN github.organization o ON o.id = r.owner_id
    WHERE r.owner_type = 'organization'
    AND r.owner_id IN (SELECT id FROM context_orgs)
    GROUP BY a.login, a.name, o.login
    ORDER BY total_commits DESC
    `,
    [orgId, minContributions]
  );
  return result.rows;
}

// Update organization connection strengths
export async function updateOrgConnectionStrengths(
  client: PoolClient
): Promise<void> {
  await client.query(
    `
    WITH contributor_counts AS (
      SELECT 
        r.owner_id as org_id,
        dc.author_id,
        COUNT(DISTINCT r.id) as repo_count,
        SUM(dc.commits) as commit_count
      FROM github.daily_contribution dc
      JOIN github.repository r ON r.id = dc.repository_id
      WHERE r.owner_type = 'organization'
      GROUP BY r.owner_id, dc.author_id
    ),
    org_pairs AS (
      SELECT 
        c1.org_id as source_org_id,
        c2.org_id as target_org_id,
        COUNT(DISTINCT c1.author_id) as shared_contributors,
        SUM(LEAST(c1.commit_count, c2.commit_count)) as connection_strength
      FROM contributor_counts c1
      JOIN contributor_counts c2 ON c1.author_id = c2.author_id
      WHERE c1.org_id < c2.org_id
      GROUP BY c1.org_id, c2.org_id
    )
    INSERT INTO github.organization_connection (
      source_org_id, target_org_id, shared_contributors,
      connection_strength, last_analyzed_at
    )
    SELECT 
      source_org_id, target_org_id, shared_contributors,
      connection_strength, NOW()
    FROM org_pairs
    ON CONFLICT (source_org_id, target_org_id) DO UPDATE SET
      shared_contributors = EXCLUDED.shared_contributors,
      connection_strength = EXCLUDED.connection_strength,
      last_analyzed_at = NOW(),
      updated_at = NOW()
    `
  );
}

// Add these new queries for reports
export async function getOrganizationStats(
  client: PoolClient,
  orgId: string
): Promise<{
  name: string;
  totalRepos: number;
  totalContributors: number;
  totalCommits: number;
  topRepositories: {
    name: string;
    stars: number;
    commits: number;
    contributors: number;
  }[];
  topContributors: {
    login: string;
    totalCommits: number;
    reposContributed: number;
  }[];
}> {
  const result = await client.query(
    `
    WITH repo_stats AS (
      SELECT 
        r.id,
        r.name,
        r.stars_count,
        r.commits_count,
        COUNT(DISTINCT dc.author_id) as contributor_count
      FROM github.repository r
      LEFT JOIN github.daily_contribution dc ON dc.repository_id = r.id
      WHERE r.owner_id = $1 AND r.owner_type = 'organization'
      GROUP BY r.id, r.name, r.stars_count, r.commits_count
    ),
    contributor_stats AS (
      SELECT 
        a.login,
        COUNT(DISTINCT dc.repository_id) as repos_contributed,
        SUM(dc.commits_count) as total_commits
      FROM github.daily_contribution dc
      JOIN github.author a ON a.id = dc.author_id
      JOIN github.repository r ON r.id = dc.repository_id
      WHERE r.owner_id = $1 AND r.owner_type = 'organization'
      GROUP BY a.login
      ORDER BY total_commits DESC
      LIMIT 10
    )
    SELECT 
      o.login as name,
      COUNT(DISTINCT r.id) as total_repos,
      COUNT(DISTINCT dc.author_id) as total_contributors,
      SUM(dc.commits_count) as total_commits,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name', rs.name,
            'stars', rs.stars_count,
            'commits', rs.commits_count,
            'contributors', rs.contributor_count
          )
          ORDER BY rs.stars_count DESC
          LIMIT 10
        ),
        '[]'::jsonb
      ) as top_repositories,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'login', cs.login,
            'totalCommits', cs.total_commits,
            'reposContributed', cs.repos_contributed
          )
        ),
        '[]'::jsonb
      ) as top_contributors
    FROM github.organization o
    LEFT JOIN github.repository r ON r.owner_id = o.id AND r.owner_type = 'organization'
    LEFT JOIN github.daily_contribution dc ON dc.repository_id = r.id
    LEFT JOIN repo_stats rs ON rs.id = r.id
    LEFT JOIN contributor_stats cs ON true
    WHERE o.id = $1
    GROUP BY o.login
    `,
    [orgId]
  );
  return result.rows[0];
}
