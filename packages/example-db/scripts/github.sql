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
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

-- Create the authors table (GitHub users)
CREATE TABLE github.author (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id bigint UNIQUE NOT NULL,
    login text NOT NULL,
    name text,
    email text,
    avatar_url text,
    bio text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

-- Create the repositories table with fork information
CREATE TABLE github.repository (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id bigint UNIQUE NOT NULL,
    name text NOT NULL,
    full_name text NOT NULL,
    description text,
    url text NOT NULL,
    homepage_url text,
    is_fork boolean NOT NULL DEFAULT false,
    fork_source_id uuid REFERENCES github.repository(id),
    owner_id uuid NOT NULL,
    owner_type text NOT NULL CHECK (owner_type IN ('organization', 'author')),
    stars_count bigint NOT NULL DEFAULT 0,
    forks_count bigint NOT NULL DEFAULT 0,
    open_issues_count bigint NOT NULL DEFAULT 0,
    pull_requests_count bigint NOT NULL DEFAULT 0,
    commits_count bigint NOT NULL DEFAULT 0,
    size_kb bigint NOT NULL DEFAULT 0,
    primary_language text,
    languages jsonb,
    topics text[],
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    pushed_at timestamp with time zone NOT NULL,
    CONSTRAINT owner_fk FOREIGN KEY (owner_id, owner_type) REFERENCES 
        (CASE 
            WHEN owner_type = 'organization' THEN github.organization(id)
            WHEN owner_type = 'author' THEN github.author(id)
        END)
);

-- Create the contributions table
CREATE TABLE github.contribution (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id uuid NOT NULL REFERENCES github.repository(id),
    author_id uuid NOT NULL REFERENCES github.author(id),
    contribution_type text NOT NULL CHECK (
        contribution_type IN ('commit', 'issue', 'pull_request', 'review')
    ),
    count bigint NOT NULL DEFAULT 0,
    first_contribution_at timestamp with time zone NOT NULL,
    last_contribution_at timestamp with time zone NOT NULL,
    UNIQUE (repository_id, author_id, contribution_type)
);

-- Create indexes for better query performance
CREATE INDEX idx_repository_owner ON github.repository(owner_id, owner_type);
CREATE INDEX idx_repository_fork_source ON github.repository(fork_source_id) WHERE fork_source_id IS NOT NULL;
CREATE INDEX idx_contribution_repository ON github.contribution(repository_id);
CREATE INDEX idx_contribution_author ON github.contribution(author_id);
CREATE INDEX idx_repository_stars ON github.repository(stars_count DESC);
CREATE INDEX idx_repository_updated ON github.repository(updated_at DESC);

-- Add full-text search capabilities
CREATE INDEX idx_repository_search ON github.repository 
    USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));