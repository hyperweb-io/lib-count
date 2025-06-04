-- DuckDB version of GitHub schema
-- Note: DuckDB doesn't need extensions for UUID - it has built-in UUID support

-- Drop the schema if it exists
DROP SCHEMA IF EXISTS github;

-- Create the schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS github;

-- Create the organizations table
CREATE TABLE github.organization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    login TEXT NOT NULL,
    name TEXT,
    description TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the authors table (GitHub users)
CREATE TABLE github.author (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    login TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    primary_email TEXT, -- Most frequently used email from commits
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create author emails table to track all emails used by contributors
CREATE TABLE github.author_email (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES github.author(id),
    email TEXT NOT NULL,
    commit_count INTEGER NOT NULL DEFAULT 1, -- How many commits used this email
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (author_id, email)
);

-- Create the repositories table
CREATE TABLE github.repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    is_fork BOOLEAN NOT NULL DEFAULT false,
    fork_date TIMESTAMPTZ,
    parent_repo TEXT, -- Full name of parent repository (e.g., "owner/repo")
    source_repo TEXT, -- Full name of ultimate source repository if different from parent
    fork_detection_method TEXT, -- 'github_api', 'known_forks', 'commit_analysis', 'name_similarity', 'manual_verification'
    fork_detection_confidence TEXT, -- 'high', 'medium', 'low'
    owner_id UUID NOT NULL REFERENCES github.organization(id),
    stars_count INTEGER NOT NULL DEFAULT 0,
    forks_count INTEGER NOT NULL DEFAULT 0,
    commits_count INTEGER NOT NULL DEFAULT 0,
    primary_language TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create daily contributions table
CREATE TABLE github.daily_contribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES github.repository(id),
    author_id UUID NOT NULL REFERENCES github.author(id),
    date DATE NOT NULL,
    commits INTEGER NOT NULL DEFAULT 0,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_daily_contribution UNIQUE (repository_id, author_id, date)
);

-- Create author organization history
CREATE TABLE github.author_organization_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES github.author(id),
    organization_id UUID NOT NULL REFERENCES github.organization(id),
    joined_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (author_id, organization_id, joined_at)
);

-- Create organization connections table for analyzing inter-org relationships
CREATE TABLE github.organization_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_org_id UUID NOT NULL REFERENCES github.organization(id),
    target_org_id UUID NOT NULL REFERENCES github.organization(id),
    shared_contributors INTEGER NOT NULL DEFAULT 0,
    last_analyzed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_orgs CHECK (source_org_id != target_org_id),
    UNIQUE (source_org_id, target_org_id)
);

-- Create contribution summary table for faster analysis
CREATE TABLE github.contribution_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES github.author(id),
    organization_id UUID NOT NULL REFERENCES github.organization(id),
    total_commits INTEGER NOT NULL DEFAULT 0,
    first_contribution_at TIMESTAMPTZ NOT NULL,
    last_contribution_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (author_id, organization_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_repository_owner ON github.repository(owner_id);
CREATE INDEX idx_repository_fork_date ON github.repository(fork_date) WHERE fork_date IS NOT NULL;
CREATE INDEX idx_repository_parent_repo ON github.repository(parent_repo) WHERE parent_repo IS NOT NULL;
CREATE INDEX idx_repository_source_repo ON github.repository(source_repo) WHERE source_repo IS NOT NULL;
CREATE INDEX idx_repository_fork_detection ON github.repository(fork_detection_method, fork_detection_confidence) WHERE is_fork = true;
CREATE INDEX idx_daily_contribution_repo_date ON github.daily_contribution(repository_id, date);
CREATE INDEX idx_daily_contribution_author_date ON github.daily_contribution(author_id, date);
CREATE INDEX idx_author_org_history_dates ON github.author_organization_history(author_id, organization_id, joined_at);
CREATE INDEX idx_author_email_author ON github.author_email(author_id);
CREATE INDEX idx_author_email_email ON github.author_email(email);
CREATE INDEX idx_author_email_commit_count ON github.author_email(author_id, commit_count DESC);

-- Add indexes for org connection queries
CREATE INDEX idx_org_connection_source ON github.organization_connection(source_org_id);
CREATE INDEX idx_org_connection_target ON github.organization_connection(target_org_id);
CREATE INDEX idx_contribution_summary_author ON github.contribution_summary(author_id);
CREATE INDEX idx_contribution_summary_org ON github.contribution_summary(organization_id);

-- Note: DuckDB doesn't support CONCURRENTLY, so we create indexes normally
CREATE INDEX repo_owner_idx ON github.repository (owner_id);
CREATE INDEX contribution_repo_idx ON github.daily_contribution (repository_id);
CREATE INDEX contribution_author_idx ON github.daily_contribution (author_id);
CREATE INDEX org_connection_source_idx ON github.organization_connection (source_org_id);

-- Note: DuckDB doesn't support PL/pgSQL, so we'll handle timestamp updates in application code
-- The original PostgreSQL triggers would need to be implemented differently

-- Stored procedures would need to be converted to macros or handled in application code
-- DuckDB supports CREATE MACRO for some use cases

-- Example function to replace the PostgreSQL stored procedure
-- Note: Macros are simpler in DuckDB and may need to be called differently
CREATE OR REPLACE FUNCTION github.get_repositories_by_org_login(org_login TEXT)
RETURNS TABLE(repository_name TEXT) AS (
    WITH org_authors AS (
        -- Get all authors associated with the given organization
        SELECT a.id AS author_id
        FROM github.author a
        JOIN github.author_organization_history aoh ON a.id = aoh.author_id
        JOIN github.organization o ON aoh.organization_id = o.id
        WHERE o.login = org_login
    )
    SELECT DISTINCT r.name AS repository_name
    FROM github.repository r
    JOIN github.daily_contribution dc ON r.id = dc.repository_id
    JOIN org_authors oa ON dc.author_id = oa.author_id
); 