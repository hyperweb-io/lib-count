import { Database } from "@cosmology/db-client";
import { organizations } from "./data-config";
import * as fs from "fs";
import * as path from "path";

interface ContributorStats {
  login: string;
  total_commits: number;
  repositories_count: number;
  first_contribution: Date;
  last_contribution: Date;
  organizations: string[];
}

interface RepositoryStats {
  name: string;
  stars: number;
  forks: number;
  commits: number;
  contributors_count: number;
  is_fork: boolean;
  primary_language?: string;
}

interface OrganizationStats {
  name: string;
  total_repos: number;
  total_contributors: number;
  total_commits: number;
  top_languages: { language: string; repo_count: number }[];
  top_repositories: RepositoryStats[];
  top_contributors: ContributorStats[];
}

interface CrossOrgCollaboration {
  source_org: string;
  target_org: string;
  shared_contributors: number;
  shared_repositories: string[];
}

interface ContributorMobility {
  login: string;
  current_orgs: string[];
  contribution_timeline: {
    org_name: string;
    first_contribution: Date;
    last_contribution: Date;
    total_commits: number;
  }[];
}

interface ExternalOrgContribution {
  org_name: string;
  total_contributors: number;
  total_commits: number;
  top_contributors: {
    login: string;
    commits: number;
    repositories: string[];
  }[];
}

interface GithubReport {
  timestamp: Date;
  summary: {
    total_organizations: number;
    total_repositories: number;
    total_contributors: number;
    total_commits: number;
    active_contributors_last_month: number;
  };
  organization_stats: OrganizationStats[];
  cross_org_insights: {
    collaborations: CrossOrgCollaboration[];
    most_connected_orgs: { org: string; connection_count: number }[];
    multi_org_contributors: {
      login: string;
      org_count: number;
      total_commits: number;
      organizations: string[];
    }[];
  };
  contributor_insights: {
    top_contributors: ContributorStats[];
    contributor_mobility: ContributorMobility[];
  };
  external_contributions: {
    top_organizations: ExternalOrgContribution[];
  };
}

async function generateReport(): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    await db.withTransaction(async (client) => {
      console.time("Summary Statistics");
      // Get summary statistics
      const summaryResult = await client.query(`
        WITH contributor_summary AS (
          SELECT COUNT(DISTINCT author_id) as total_contributors,
                 COUNT(DISTINCT CASE 
                   WHEN date >= NOW() - INTERVAL '30 days' 
                   THEN author_id 
                 END) as active_contributors
          FROM github.daily_contribution
        )
        SELECT 
          (SELECT COUNT(*) FROM github.organization WHERE is_active = true) as total_organizations,
          (SELECT COUNT(*) FROM github.repository) as total_repositories,
          cs.total_contributors,
          cs.active_contributors as active_contributors_last_month,
          (SELECT COALESCE(SUM(commits), 0) FROM github.daily_contribution) as total_commits
        FROM contributor_summary cs
      `);
      console.timeEnd("Summary Statistics");
      const summary = summaryResult.rows[0];

      console.time("Organization Statistics");
      // Get organization statistics - optimized version
      const organizationStatsResult = await client.query(
        `
        WITH org_list AS (
          SELECT id, login as name 
          FROM github.organization 
          WHERE login = ANY($1)
        ),
        repo_aggregates AS (
          SELECT
            r.owner_id,
            COUNT(DISTINCT r.id) AS total_repos,
            COUNT(DISTINCT r.primary_language) FILTER (WHERE r.primary_language IS NOT NULL) AS languages_count,
            SUM(r.stars_count) AS total_stars,
            SUM(r.forks_count) AS total_forks
          FROM github.repository r
          JOIN org_list ol ON r.owner_id = ol.id
          GROUP BY r.owner_id
        ),
        contributor_aggregates AS (
          SELECT
            r.owner_id,
            dc.author_id,
            SUM(dc.commits) AS total_commits,
            MIN(dc.date) AS first_contribution,
            MAX(dc.date) AS last_contribution
          FROM github.daily_contribution dc
          JOIN github.repository r ON dc.repository_id = r.id
          JOIN org_list ol ON r.owner_id = ol.id
          GROUP BY r.owner_id, dc.author_id
        ),
        language_ranking AS (
          SELECT
            r.owner_id,
            r.primary_language AS language,
            COUNT(*) AS repo_count,
            DENSE_RANK() OVER (PARTITION BY r.owner_id ORDER BY COUNT(*) DESC) AS language_rank
          FROM github.repository r
          JOIN org_list ol ON r.owner_id = ol.id
          WHERE r.primary_language IS NOT NULL
          GROUP BY r.owner_id, r.primary_language
        ),
        top_languages AS (
          SELECT
            owner_id,
            JSONB_AGG(JSONB_BUILD_OBJECT(
              'language', language,
              'repo_count', repo_count
            )) AS languages
          FROM language_ranking
          WHERE language_rank <= 5
          GROUP BY owner_id
        ),
        repo_ranking AS (
          SELECT
            r.owner_id,
            r.id AS repo_id,
            r.name,
            r.stars_count,
            r.forks_count,
            r.commits_count,
            DENSE_RANK() OVER (PARTITION BY r.owner_id ORDER BY r.stars_count DESC) AS repo_rank
          FROM github.repository r
          JOIN org_list ol ON r.owner_id = ol.id
        ),
        top_repos AS (
          SELECT
            owner_id,
            JSONB_AGG(JSONB_BUILD_OBJECT(
              'name', name,
              'stars', stars_count,
              'forks', forks_count,
              'commits', commits_count
            )) AS repos
          FROM repo_ranking
          WHERE repo_rank <= 5
          GROUP BY owner_id
        ),
        contributor_ranking AS (
          SELECT
            ca.owner_id,
            a.login,
            ca.total_commits,
            COUNT(DISTINCT r.id) AS repo_count,
            ca.first_contribution,
            ca.last_contribution,
            DENSE_RANK() OVER (PARTITION BY ca.owner_id ORDER BY ca.total_commits DESC) AS contributor_rank
          FROM contributor_aggregates ca
          JOIN github.author a ON ca.author_id = a.id
          JOIN github.repository r ON ca.owner_id = r.owner_id
          GROUP BY ca.owner_id, a.login, ca.total_commits, ca.first_contribution, ca.last_contribution
        ),
        top_contributors AS (
          SELECT
            owner_id,
            JSONB_AGG(JSONB_BUILD_OBJECT(
              'login', login,
              'total_commits', total_commits,
              'repositories_count', repo_count,
              'first_contribution', first_contribution,
              'last_contribution', last_contribution
            )) AS contributors
          FROM contributor_ranking
          WHERE contributor_rank <= 5
          GROUP BY owner_id
        )
        SELECT
          ol.name,
          ra.total_repos,
          ra.total_stars,
          ra.total_forks,
          COALESCE(tl.languages, '[]') AS top_languages,
          COALESCE(tr.repos, '[]') AS top_repositories,
          COALESCE(tc.contributors, '[]') AS top_contributors,
          COUNT(DISTINCT ca.author_id) AS total_contributors,
          COALESCE(SUM(ca.total_commits), 0) AS total_commits
        FROM org_list ol
        LEFT JOIN repo_aggregates ra ON ol.id = ra.owner_id
        LEFT JOIN top_languages tl ON ol.id = tl.owner_id
        LEFT JOIN top_repos tr ON ol.id = tr.owner_id
        LEFT JOIN top_contributors tc ON ol.id = tc.owner_id
        LEFT JOIN contributor_aggregates ca ON ol.id = ca.owner_id
        GROUP BY ol.id, ol.name, ra.total_repos, ra.total_stars, ra.total_forks, tl.languages, tr.repos, tc.contributors
        ORDER BY ol.name;
      `,
        [organizations]
      );

      const organizationStats = organizationStatsResult.rows;
      console.timeEnd("Organization Statistics");

      console.time("Cross-Organization Insights");
      // Get cross-organization collaboration insights
      const crossOrgInsightsResult = await client.query(`
        WITH contributor_orgs AS (
          SELECT 
            a.login,
            array_agg(DISTINCT o.login) as organizations,
            COUNT(DISTINCT o.id) as org_count,
            SUM(dc.commits) as total_commits
          FROM github.author a
          JOIN github.daily_contribution dc ON dc.author_id = a.id
          JOIN github.repository r ON r.id = dc.repository_id
          JOIN github.organization o ON o.id = r.owner_id
          GROUP BY a.id, a.login
          HAVING COUNT(DISTINCT o.id) > 1
        ),
        org_connections AS (
          SELECT 
            o.login as org,
            COUNT(DISTINCT oc.target_org_id) as connection_count
          FROM github.organization o
          JOIN github.organization_connection oc ON oc.source_org_id = o.id
          GROUP BY o.login
          ORDER BY connection_count DESC
          LIMIT 10
        )
        SELECT 
          COALESCE(json_agg(
            json_build_object(
              'login', co.login,
              'org_count', co.org_count,
              'total_commits', co.total_commits,
              'organizations', co.organizations
            )
          ) FILTER (WHERE co.login IS NOT NULL), '[]') as multi_org_contributors,
          COALESCE(json_agg(
            json_build_object(
              'org', oc.org,
              'connection_count', oc.connection_count
            )
          ) FILTER (WHERE oc.org IS NOT NULL), '[]') as most_connected_orgs
        FROM contributor_orgs co
        CROSS JOIN org_connections oc
      `);
      console.timeEnd("Cross-Organization Insights");
      const crossOrgInsights = crossOrgInsightsResult.rows[0];

      console.time("External Organizations Analysis");
      const externalOrgsResult = await client.query(
        `
        WITH all_external_orgs AS (
          -- First get all organizations that our contributors belong to
          SELECT DISTINCT
            o.id,
            o.login as org_name
          FROM github.organization o
          JOIN github.author_organization_history aoh ON o.id = aoh.organization_id
          WHERE o.login != ALL($1)  -- Exclude our tracked organizations
        ),
        external_orgs AS (
          SELECT DISTINCT
            eo.org_name,
            a.login as contributor_login,
            COUNT(DISTINCT dc.id) as commit_count,
            array_agg(DISTINCT r.name) as repositories
          FROM github.daily_contribution dc
          JOIN github.repository r ON dc.repository_id = r.id
          JOIN github.author a ON dc.author_id = a.id
          JOIN github.author_organization_history aoh ON a.id = aoh.author_id
          JOIN all_external_orgs eo ON aoh.organization_id = eo.id
          WHERE r.owner_id IN (
            SELECT id FROM github.organization WHERE login = ANY($1)
          )
          GROUP BY eo.org_name, a.login
        ),
        top_contributors AS (
          SELECT 
            org_name,
            contributor_login,
            commit_count,
            repositories
          FROM external_orgs
          WHERE (
            SELECT COUNT(*)
            FROM external_orgs e2
            WHERE e2.org_name = external_orgs.org_name
            AND e2.commit_count >= external_orgs.commit_count
          ) <= 5
        ),
        org_summary AS (
          SELECT 
            aeo.org_name,
            COUNT(DISTINCT e.contributor_login) as total_contributors,
            COALESCE(SUM(e.commit_count), 0) as total_commits
          FROM all_external_orgs aeo
          LEFT JOIN external_orgs e ON e.org_name = aeo.org_name
          GROUP BY aeo.org_name
        )
        SELECT 
          json_agg(
            json_build_object(
              'org_name', s.org_name,
              'total_contributors', s.total_contributors,
              'total_commits', s.total_commits,
              'top_contributors', COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'login', tc.contributor_login,
                      'commits', tc.commit_count,
                      'repositories', tc.repositories
                    )
                  )
                  FROM top_contributors tc
                  WHERE tc.org_name = s.org_name
                ),
                '[]'::json
              )
            )
            ORDER BY s.total_commits DESC
          ) as top_organizations
        FROM (
          SELECT * FROM org_summary
          WHERE total_commits > 0  -- Only include orgs with actual contributions
          ORDER BY total_commits DESC
          LIMIT 10
        ) s
      `,
        [organizations]
      );
      console.timeEnd("External Organizations Analysis");

      const externalContributions =
        externalOrgsResult.rows[0].top_organizations || [];

      const report = {
        timestamp: new Date(),
        summary,
        organization_stats: organizationStats,
        cross_org_insights: {
          collaborations: [] as CrossOrgCollaboration[],
          most_connected_orgs: crossOrgInsights.most_connected_orgs,
          multi_org_contributors: crossOrgInsights.multi_org_contributors,
        },
        contributor_insights: {
          top_contributors: [] as ContributorStats[],
          contributor_mobility: [] as ContributorMobility[],
        },
        external_contributions: {
          top_organizations: externalContributions,
        },
      } satisfies GithubReport;

      // Generate markdown report
      console.time("Markdown Report Generation");
      const markdownReport = generateMarkdownReport(report);
      console.timeEnd("Markdown Report Generation");

      // Write report to file
      const outputDir = path.join(__dirname, "../../../exports");
      const reportPath = path.join(outputDir, "github-report.md");

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write the report
      fs.writeFileSync(reportPath, markdownReport);
      console.log(`Report written to: ${reportPath}`);

      // Also write JSON data for badges
      const badgeData = generateBadgeData(report);
      const badgesDir = path.join(outputDir, "badges", "github");
      if (!fs.existsSync(badgesDir)) {
        fs.mkdirSync(badgesDir, { recursive: true });
      }

      // Write badge data
      Object.entries(badgeData).forEach(([name, data]) => {
        const badgePath = path.join(badgesDir, `${name}.json`);
        fs.writeFileSync(badgePath, JSON.stringify(data, null, 2));
      });
      console.log(`Badge data written to: ${badgesDir}`);
    });
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Transaction failed after ${duration} seconds:`, error);
    throw error;
  }
}

function generateBadgeData(report: GithubReport): Record<string, any> {
  const totalContributors = report.summary.total_contributors;
  const activeContributors = report.summary.active_contributors_last_month;
  const totalCommits = report.summary.total_commits;

  return {
    total_contributors: {
      schemaVersion: 1,
      label: "Total Contributors",
      message: formatNumber(totalContributors),
      color: "blue",
    },
    active_contributors: {
      schemaVersion: 1,
      label: "Active Contributors",
      message: formatNumber(activeContributors),
      color: "green",
    },
    total_commits: {
      schemaVersion: 1,
      label: "Total Commits",
      message: formatNumber(totalCommits),
      color: "orange",
    },
  };
}

function generateMarkdownReport(report: GithubReport): string {
  const sections = [
    generateHeader(),
    generateBadgesSection(),
    generateSummarySection(report.summary),
    generateOrganizationSection(report.organization_stats),
    generateCollaborationSection(report.cross_org_insights),
    generateExternalContributionsSection(report.external_contributions),
    generateOverviewSection(),
    generateFooter(),
  ];

  return sections.join("\n\n");
}

function generateBadgesSection(): string {
  return `
<p align="center" width="100%">
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fgithub%2Ftotal_contributors.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fgithub%2Factive_contributors.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fgithub%2Ftotal_commits.json"/>
</p>`;
}

function generateOverviewSection(): string {
  return `## About Our GitHub Activity

This report provides insights into our GitHub organizations' activities, collaborations, and contributions. It covers:

- Cross-organization collaboration patterns
- Contributor activity and mobility
- Repository statistics and language distributions
- Historical contribution data

### Organizations Tracked
${organizations.map((org) => `- [${org}](https://github.com/${org})`).join("\n")}
`;
}

function formatNumber(num: number | null | undefined): string {
  return (num ?? 0).toLocaleString();
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function generateHeader(): string {
  return `# GitHub Collaboration Insights Report
<p align="center">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" width="100" alt="GitHub Logo">
</p>

This report provides insights into cross-organization collaboration patterns and contributor activities across our GitHub organizations.
`;
}

function generateSummarySection(summary: GithubReport["summary"]): string {
  return `## 📊 Overall Statistics

| Metric | Count |
|--------|-------|
| Organizations | ${formatNumber(summary.total_organizations)} |
| Repositories | ${formatNumber(summary.total_repositories)} |
| Total Contributors | ${formatNumber(summary.total_contributors)} |
| Active Contributors (Last 30 Days) | ${formatNumber(summary.active_contributors_last_month)} |
| Total Commits | ${formatNumber(summary.total_commits)} |
`;
}

function generateOrganizationSection(orgStats: OrganizationStats[]): string {
  const sections = [`## 🏢 Organization Insights\n`];

  orgStats.forEach((org) => {
    sections.push(`### ${org.name}

#### Overview
- Total Repositories: ${formatNumber(org.total_repos)}
- Total Contributors: ${formatNumber(org.total_contributors)}
- Total Commits: ${formatNumber(org.total_commits)}

#### 🔝 Top Languages
${(org.top_languages || []).map((lang) => `- ${lang.language}: ${formatNumber(lang.repo_count)} repos`).join("\n")}

#### 📚 Top Repositories
| Repository | Stars | Forks | Commits | Contributors |
|------------|-------|-------|---------|--------------|
${(org.top_repositories || [])
  .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  .slice(0, 5)
  .map(
    (repo) =>
      `| ${repo.name} | ${formatNumber(repo.stars)} | ${formatNumber(repo.forks)} | ${formatNumber(repo.commits)} | ${formatNumber(repo.contributors_count)} |`
  )
  .join("\n")}

#### 👥 Top Contributors
| Contributor | Commits | Repositories | First Contribution | Last Contribution |
|-------------|---------|--------------|-------------------|------------------|
${(org.top_contributors || [])
  .sort((a, b) => (b.total_commits ?? 0) - (a.total_commits ?? 0))
  .slice(0, 5)
  .map(
    (contrib) =>
      `| @${contrib.login} | ${formatNumber(contrib.total_commits)} | ${formatNumber(contrib.repositories_count)} | ${formatDate(contrib.first_contribution)} | ${formatDate(contrib.last_contribution)} |`
  )
  .join("\n")}
`);
  });

  return sections.join("\n");
}

function generateCollaborationSection(
  insights: GithubReport["cross_org_insights"]
): string {
  return `## 🤝 Cross-Organization Collaboration

### Multi-Organization Contributors
These contributors are active across multiple organizations:

| Contributor | Organizations | Total Commits |
|------------|---------------|---------------|
${(insights.multi_org_contributors || [])
  .slice(0, 10)
  .map(
    (contributor) =>
      `| @${contributor.login} | ${formatNumber(contributor.org_count)} | ${formatNumber(contributor.total_commits)} |`
  )
  .join("\n")}

### Organization Connections
${(insights.most_connected_orgs || [])
  .map(
    (org) =>
      `- **${org.org}** is connected to ${formatNumber(org.connection_count)} other organizations`
  )
  .join("\n")}
`;
}

function generateExternalContributionsSection(
  externalContributions: GithubReport["external_contributions"]
): string {
  if (!externalContributions.top_organizations.length) {
    return "";
  }

  return `## 🌐 External Organization Contributions

Our projects benefit from contributions by members of various external organizations. Here are the top organizations whose members contribute to our repositories:

${externalContributions.top_organizations
  .map(
    (org) => `
### ${org.org_name}
- Total Contributors: ${formatNumber(org.total_contributors)}
- Total Commits: ${formatNumber(org.total_commits)}

#### Top Contributors from ${org.org_name}
| Contributor | Commits | Repositories |
|------------|---------|--------------|
${org.top_contributors
  .map(
    (contributor) =>
      `| @${contributor.login} | ${formatNumber(contributor.commits)} | ${
        contributor.repositories.length
      } repos |`
  )
  .join("\n")}
`
  )
  .join("\n")}

*Note: This analysis is based on the public organization affiliations of contributors.*
`;
}

function generateFooter(): string {
  return `
---
<p align="center">
  Generated on ${new Date().toLocaleString()} • 
  Data sourced from GitHub API
</p>`;
}

async function run(): Promise<void> {
  try {
    await generateReport();
  } catch (error) {
    console.error("Failed to run report generation:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

export { generateReport };
