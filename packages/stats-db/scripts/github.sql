-- Drop the schema if it exists
DROP SCHEMA IF EXISTS github CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create the schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS github;

-- Create the organizations table
CREATE TABLE github.organization (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id bigint UNIQUE NOT NULL,
    login text NOT NULL,
    name text,
    description text,
    avatar_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create the authors table (GitHub users)
CREATE TABLE github.author (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id bigint UNIQUE NOT NULL,
    login text NOT NULL,
    name text,
    avatar_url text,
    primary_email text, -- Most frequently used email from commits
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create author emails table to track all emails used by contributors
CREATE TABLE github.author_email (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id uuid NOT NULL REFERENCES github.author(id),
    email text NOT NULL,
    commit_count integer NOT NULL DEFAULT 1, -- How many commits used this email
    first_seen_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (author_id, email)
);

-- Create the repositories table
CREATE TABLE github.repository (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id bigint UNIQUE NOT NULL,
    name text NOT NULL,
    full_name text NOT NULL,
    description text,
    url text NOT NULL,
    is_fork boolean NOT NULL DEFAULT false,
    fork_date timestamp with time zone,
    parent_repo text, -- Full name of parent repository (e.g., "owner/repo")
    source_repo text, -- Full name of ultimate source repository if different from parent
    fork_detection_method text, -- 'github_api', 'known_forks', 'commit_analysis', 'name_similarity', 'manual_verification'
    fork_detection_confidence text, -- 'high', 'medium', 'low'
    owner_id uuid NOT NULL REFERENCES github.organization(id),
    stars_count integer NOT NULL DEFAULT 0,
    forks_count integer NOT NULL DEFAULT 0,
    commits_count integer NOT NULL DEFAULT 0,
    primary_language text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create daily contributions table
CREATE TABLE github.daily_contribution (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id uuid NOT NULL REFERENCES github.repository(id),
    author_id uuid NOT NULL REFERENCES github.author(id),
    date date NOT NULL,
    commits integer NOT NULL DEFAULT 0,
    additions integer NOT NULL DEFAULT 0,
    deletions integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_daily_contribution UNIQUE (repository_id, author_id, date)
);

-- Create author organization history
CREATE TABLE github.author_organization_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id uuid NOT NULL REFERENCES github.author(id),
    organization_id uuid NOT NULL REFERENCES github.organization(id),
    joined_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (author_id, organization_id, joined_at)
);

-- Create organization connections table for analyzing inter-org relationships
CREATE TABLE github.organization_connection (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_org_id uuid NOT NULL REFERENCES github.organization(id),
    target_org_id uuid NOT NULL REFERENCES github.organization(id),
    shared_contributors integer NOT NULL DEFAULT 0,
    last_analyzed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_orgs CHECK (source_org_id != target_org_id),
    UNIQUE (source_org_id, target_org_id)
);

-- Create contribution summary table for faster analysis
CREATE TABLE github.contribution_summary (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id uuid NOT NULL REFERENCES github.author(id),
    organization_id uuid NOT NULL REFERENCES github.organization(id),
    total_commits integer NOT NULL DEFAULT 0,
    first_contribution_at timestamp with time zone NOT NULL,
    last_contribution_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
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

CREATE INDEX CONCURRENTLY IF NOT EXISTS repo_owner_idx ON github.repository (owner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS contribution_repo_idx ON github.daily_contribution (repository_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS contribution_author_idx ON github.daily_contribution (author_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS org_connection_source_idx ON github.organization_connection (source_org_id); 

-- Create timestamp update trigger
CREATE OR REPLACE FUNCTION github.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_organization_timestamp
    BEFORE UPDATE ON github.organization
    FOR EACH ROW
    EXECUTE FUNCTION github.update_updated_at();

CREATE TRIGGER update_author_timestamp
    BEFORE UPDATE ON github.author
    FOR EACH ROW
    EXECUTE FUNCTION github.update_updated_at();

CREATE TRIGGER update_repository_timestamp
    BEFORE UPDATE ON github.repository
    FOR EACH ROW
    EXECUTE FUNCTION github.update_updated_at();

-- Add trigger for org connection timestamp
CREATE TRIGGER update_org_connection_timestamp
    BEFORE UPDATE ON github.organization_connection
    FOR EACH ROW
    EXECUTE FUNCTION github.update_updated_at();

-- Add trigger for contribution summary timestamp
CREATE TRIGGER update_contribution_summary_timestamp
    BEFORE UPDATE ON github.contribution_summary
    FOR EACH ROW
    EXECUTE FUNCTION github.update_updated_at();

-- Stored procedures

CREATE OR REPLACE FUNCTION github.get_repositories_by_org_login(org_login TEXT)
RETURNS TABLE(repository_name TEXT) AS $$
BEGIN
    RETURN QUERY
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
    JOIN org_authors oa ON dc.author_id = oa.author_id;
END;
$$ LANGUAGE plpgsql;
