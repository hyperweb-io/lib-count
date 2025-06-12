import { db } from "../../db";
import {
  author,
  authorOrganizationHistory,
  dailyContribution,
  organization,
  organizationConnection,
  repository,
} from "../../schema/github";
import { organizations } from "./data-config";
import * as fs from "fs";
import * as path from "path";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  sql,
  sum,
  notInArray,
  min,
  max,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

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
  const scriptStartTime = Date.now();

  try {
    console.time("Summary Statistics");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalOrganizationsResult = await db
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.isActive, true));

    const totalRepositoriesResult = await db
      .select({ value: count() })
      .from(repository);

    const totalCommitsResult = await db
      .select({ value: sum(dailyContribution.commits) })
      .from(dailyContribution);

    const totalContributorsResult = await db
      .select({ value: countDistinct(dailyContribution.authorId) })
      .from(dailyContribution);

    const activeContributorsResult = await db
      .select({ value: countDistinct(dailyContribution.authorId) })
      .from(dailyContribution)
      .where(gte(dailyContribution.date, thirtyDaysAgo));

    const summary = {
      total_organizations: totalOrganizationsResult[0].value,
      total_repositories: totalRepositoriesResult[0].value,
      total_contributors: totalContributorsResult[0].value,
      active_contributors_last_month: activeContributorsResult[0].value,
      total_commits: Number(totalCommitsResult[0].value || 0),
    };
    console.timeEnd("Summary Statistics");

    console.time("Organization Statistics");
    const organizationStats: OrganizationStats[] = [];

    const targetOrgs = await db
      .select()
      .from(organization)
      .where(inArray(organization.login, organizations));

    for (const org of targetOrgs) {
      const orgRepos = await db
        .select()
        .from(repository)
        .where(eq(repository.ownerId, org.id));
      const repoIds = orgRepos.map((r) => r.id);

      if (repoIds.length === 0) {
        organizationStats.push({
          name: org.login,
          total_repos: 0,
          total_contributors: 0,
          total_commits: 0,
          top_languages: [],
          top_repositories: [],
          top_contributors: [],
        });
        continue;
      }

      const repoCommitsAndContributors = await db
        .select({
          repoId: dailyContribution.repositoryId,
          totalCommits: sum(dailyContribution.commits),
          contributorsCount: countDistinct(dailyContribution.authorId),
        })
        .from(dailyContribution)
        .where(inArray(dailyContribution.repositoryId, repoIds))
        .groupBy(dailyContribution.repositoryId);

      const repoExtraStatsMap = repoCommitsAndContributors.reduce(
        (acc, r) => {
          acc[r.repoId] = {
            commits: Number(r.totalCommits || 0),
            contributors: r.contributorsCount,
          };
          return acc;
        },
        {} as Record<string, { commits: number; contributors: number }>
      );

      const topRepositories: RepositoryStats[] = orgRepos
        .map((r) => ({
          name: r.name,
          stars: r.starsCount,
          forks: r.forksCount,
          commits: repoExtraStatsMap[r.id]?.commits || 0,
          contributors_count: repoExtraStatsMap[r.id]?.contributors || 0,
          is_fork: r.isFork,
          primary_language: r.primaryLanguage || undefined,
        }))
        .sort((a, b) => b.stars - a.stars)
        .slice(0, 10);

      const topLanguagesResult = await db
        .select({
          language: repository.primaryLanguage,
          repo_count: count(),
        })
        .from(repository)
        .where(
          and(
            eq(repository.ownerId, org.id),
            sql`${repository.primaryLanguage} IS NOT NULL`
          )
        )
        .groupBy(repository.primaryLanguage)
        .orderBy(desc(count()))
        .limit(5);

      const contributorStatsResult = await db
        .select({
          authorId: dailyContribution.authorId,
          totalCommits: sum(dailyContribution.commits),
          reposCount: countDistinct(dailyContribution.repositoryId),
          firstContribution: min(dailyContribution.date),
          lastContribution: max(dailyContribution.date),
        })
        .from(dailyContribution)
        .where(inArray(dailyContribution.repositoryId, repoIds))
        .groupBy(dailyContribution.authorId);

      const totalCommits = contributorStatsResult.reduce(
        (acc, s) => acc + Number(s.totalCommits || 0),
        0
      );
      const totalContributors = contributorStatsResult.length;

      const topContributorsAuthors = await db
        .select({ id: author.id, login: author.login })
        .from(author)
        .where(
          inArray(
            author.id,
            contributorStatsResult.map((cs) => cs.authorId)
          )
        );
      const authorLoginMap = topContributorsAuthors.reduce(
        (acc, a) => {
          acc[a.id] = a.login;
          return acc;
        },
        {} as Record<string, string>
      );

      const topContributors: ContributorStats[] = contributorStatsResult
        .sort((a, b) => Number(b.totalCommits) - Number(a.totalCommits))
        .slice(0, 10)
        .map((s) => ({
          login: authorLoginMap[s.authorId],
          total_commits: Number(s.totalCommits),
          repositories_count: s.reposCount,
          first_contribution: new Date(s.firstContribution),
          last_contribution: new Date(s.lastContribution),
          organizations: [org.login],
        }));

      organizationStats.push({
        name: org.login,
        total_repos: orgRepos.length,
        total_contributors: totalContributors,
        total_commits: totalCommits,
        top_languages: topLanguagesResult.map((l) => ({
          language: l.language!,
          repo_count: l.repo_count,
        })),
        top_repositories: topRepositories,
        top_contributors: topContributors,
      });
    }
    console.timeEnd("Organization Statistics");

    console.time("Cross-Organization Insights");
    const src = alias(organization, "src");
    const mostConnectedOrgsResult = await db
      .select({
        org: src.login,
        connection_count: count(organizationConnection.targetOrgId),
      })
      .from(organizationConnection)
      .innerJoin(src, eq(src.id, organizationConnection.sourceOrgId))
      .groupBy(src.login)
      .orderBy(desc(count(organizationConnection.targetOrgId)))
      .limit(10);

    const contributionsWithOrgs = await db
      .select({
        authorId: author.id,
        authorLogin: author.login,
        orgLogin: organization.login,
        commits: sum(dailyContribution.commits),
      })
      .from(dailyContribution)
      .innerJoin(author, eq(author.id, dailyContribution.authorId))
      .innerJoin(repository, eq(repository.id, dailyContribution.repositoryId))
      .innerJoin(organization, eq(organization.id, repository.ownerId))
      .groupBy(author.id, author.login, organization.login);

    const contributorsWithMultipleOrgs: {
      [login: string]: {
        orgs: Set<string>;
        totalCommits: number;
      };
    } = {};

    for (const c of contributionsWithOrgs) {
      if (!contributorsWithMultipleOrgs[c.authorLogin]) {
        contributorsWithMultipleOrgs[c.authorLogin] = {
          orgs: new Set(),
          totalCommits: 0,
        };
      }
      contributorsWithMultipleOrgs[c.authorLogin].orgs.add(c.orgLogin);
      contributorsWithMultipleOrgs[c.authorLogin].totalCommits += Number(
        c.commits
      );
    }

    const multiOrgContributors = Object.entries(contributorsWithMultipleOrgs)
      .filter(([, data]) => data.orgs.size > 1)
      .map(([login, data]) => ({
        login: login,
        org_count: data.orgs.size,
        total_commits: data.totalCommits,
        organizations: Array.from(data.orgs),
      }));

    const crossOrgInsights = {
      most_connected_orgs: mostConnectedOrgsResult,
      multi_org_contributors: multiOrgContributors,
    };
    console.timeEnd("Cross-Organization Insights");

    console.time("External Organizations Analysis");
    const ourOrgIds = targetOrgs.map((o) => o.id);
    const ourRepoIds = (
      await db
        .select({ id: repository.id })
        .from(repository)
        .where(inArray(repository.ownerId, ourOrgIds))
    ).map((r) => r.id);

    const ourContributorsIds = (
      await db
        .selectDistinct({ authorId: dailyContribution.authorId })
        .from(dailyContribution)
        .where(inArray(dailyContribution.repositoryId, ourRepoIds))
    ).map((c) => c.authorId);

    const allAuthorOrgs = await db
      .selectDistinct({
        orgId: authorOrganizationHistory.organizationId,
        authorId: authorOrganizationHistory.authorId,
      })
      .from(authorOrganizationHistory)
      .where(inArray(authorOrganizationHistory.authorId, ourContributorsIds));

    const externalOrgIds = allAuthorOrgs
      .map((ao) => ao.orgId)
      .filter((id) => !ourOrgIds.includes(id));

    const uniqueExternalOrgIds = [...new Set(externalOrgIds)];

    if (uniqueExternalOrgIds.length > 0) {
      const externalOrgs = await db
        .select({ id: organization.id, name: organization.login })
        .from(organization)
        .where(inArray(organization.id, uniqueExternalOrgIds));

      let externalContributionsData: ExternalOrgContribution[] = [];

      for (const extOrg of externalOrgs) {
        const membersOfExternalOrg = allAuthorOrgs
          .filter((ao) => ao.orgId === extOrg.id)
          .map((ao) => ao.authorId);

        if (membersOfExternalOrg.length === 0) continue;

        const contributionsFromMembers = await db
          .select({
            authorId: dailyContribution.authorId,
            repoId: dailyContribution.repositoryId,
            commits: dailyContribution.commits,
          })
          .from(dailyContribution)
          .where(
            and(
              inArray(dailyContribution.authorId, membersOfExternalOrg),
              inArray(dailyContribution.repositoryId, ourRepoIds)
            )
          );

        if (contributionsFromMembers.length === 0) continue;

        const totalCommitsToOurRepos = contributionsFromMembers.reduce(
          (sum, c) => sum + (c.commits || 0),
          0
        );
        const totalContributorsFromExtOrg = new Set(
          contributionsFromMembers.map((c) => c.authorId)
        ).size;

        const topContributorsFromExtOrgData: {
          [authorId: string]: { commits: number; repos: Set<string> };
        } = {};

        const ourReposForNames = await db
          .select({ id: repository.id, name: repository.name })
          .from(repository)
          .where(inArray(repository.id, ourRepoIds));
        const repoIdToName = ourReposForNames.reduce(
          (acc, r) => ({ ...acc, [r.id]: r.name }),
          {} as Record<string, string>
        );

        for (const c of contributionsFromMembers) {
          if (!topContributorsFromExtOrgData[c.authorId]) {
            topContributorsFromExtOrgData[c.authorId] = {
              commits: 0,
              repos: new Set(),
            };
          }
          topContributorsFromExtOrgData[c.authorId].commits += c.commits || 0;
          topContributorsFromExtOrgData[c.authorId].repos.add(
            repoIdToName[c.repoId]
          );
        }

        const authorsInfo = await db
          .select({ id: author.id, login: author.login })
          .from(author)
          .where(
            inArray(author.id, Object.keys(topContributorsFromExtOrgData))
          );
        const authorIdToLogin = authorsInfo.reduce(
          (acc, a) => ({ ...acc, [a.id]: a.login }),
          {} as Record<string, string>
        );

        const topContributors = Object.entries(topContributorsFromExtOrgData)
          .sort(([, a], [, b]) => b.commits - a.commits)
          .slice(0, 5)
          .map(([authorId, data]) => ({
            login: authorIdToLogin[authorId],
            commits: data.commits,
            repositories: Array.from(data.repos),
          }));

        externalContributionsData.push({
          org_name: extOrg.name,
          total_contributors: totalContributorsFromExtOrg,
          total_commits: totalCommitsToOurRepos,
          top_contributors: topContributors,
        });
      }

      const externalContributions = externalContributionsData
        .sort((a, b) => b.total_commits - a.total_commits)
        .slice(0, 10);

      console.timeEnd("External Organizations Analysis");

      const report = {
        timestamp: new Date(),
        summary,
        organization_stats: organizationStats,
        cross_org_insights: {
          collaborations: [] as CrossOrgCollaboration[],
          ...crossOrgInsights,
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
      const outputDir = path.join(__dirname, "../../../output/reports");
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
    } else {
      console.log("No external organizations to analyze.");
    }
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Report generation failed after ${duration} seconds:`, error);
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
