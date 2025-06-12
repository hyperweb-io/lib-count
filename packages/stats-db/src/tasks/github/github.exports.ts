import { db } from "../../db";
import {
  author,
  dailyContribution,
  organization,
  repository,
} from "../../schema";
import * as fs from "fs";
import * as path from "path";
import { and, eq, gt, sql, sum, desc, like, or, not } from "drizzle-orm";

export interface Contributor {
  githubId: string;
  avatarUrl: string;
  contributions: number;
}

// Common patterns for bot accounts
const BOT_PATTERNS = [
  "bot",
  "Bot",
  "[bot]",
  "-bot",
  "dependabot",
  "renovate",
  "github-actions",
  "semantic-release",
  "netlify",
  "vercel",
  "snyk",
  "imgbot",
  "codecov",
  "stale",
  "allcontributors",
  "whitesource",
  "sonarcloud",
  "github-pages",
  "circleci",
  "travis",
  "jenkins",
  "azure-pipelines",
  "gitlab",
  "bitbucket",
  "appveyor",
  "probot",
  "greenkeeper",
  "heroku",
  "deepsource",
  "codefactor",
  "codacy",
  "fossabot",
  "lgtm",
];

async function exportContributors(): Promise<void> {
  try {
    const contributors = await db
      .select({
        githubId: author.login,
        avatarUrl: author.avatarUrl,
        contributions: sql<number>`sum(${dailyContribution.commits})`.mapWith(
          Number
        ),
      })
      .from(author)
      .innerJoin(dailyContribution, eq(author.id, dailyContribution.authorId))
      .innerJoin(repository, eq(dailyContribution.repositoryId, repository.id))
      .innerJoin(organization, eq(repository.ownerId, organization.id))
      .where(eq(organization.isActive, true))
      .groupBy(author.login, author.avatarUrl)
      .having(gt(sum(dailyContribution.commits), 0))
      .orderBy(desc(sql`sum(${dailyContribution.commits})`));

    // Additional JavaScript-side filtering for edge cases
    const filteredContributors = contributors.filter(
      (contributor: Contributor) => {
        const login = contributor.githubId.toLowerCase();
        if (BOT_PATTERNS.some((pattern) => login.includes(pattern))) {
          return false;
        }
        if (/^[a-z0-9-]*bot[a-z0-9-]*$/.test(login)) return false;
        if (/^bot[0-9]+$/.test(login)) return false;
        if (/^[0-9a-f]{40}$/.test(login)) return false;
        if (/^app\/[a-z0-9-]+$/.test(login)) return false;
        if (login.includes("automation")) return false;
        if (login.includes("action")) return false;
        if (login.endsWith("-ci")) return false;
        if (login.endsWith("-cd")) return false;
        if (login.startsWith("srv-")) return false;
        return true;
      }
    );

    // Ensure exports directory exists
    const outputDir = path.join(__dirname, "../../../output/exports");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write contributors.json
    const outputPath = path.join(outputDir, "contributors.json");
    fs.writeFileSync(outputPath, JSON.stringify(filteredContributors, null, 2));

    console.log(`Found ${contributors.length} total contributors`);
    console.log(
      `Filtered out ${contributors.length - filteredContributors.length} bots`
    );
    console.log(`Contributors data exported to: ${outputPath}`);
  } catch (error) {
    console.error("Failed to export contributors:", error);
    throw error;
  }
}

export { exportContributors };
