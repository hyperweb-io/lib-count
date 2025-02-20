import { Database } from "@cosmology/db-client";
import * as fs from "fs";
import * as path from "path";

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
  const db = new Database();

  try {
    await db.withTransaction(async (client) => {
      const result = await client.query(`
        WITH contributor_stats AS (
          SELECT 
            a.login as github_id,
            a.avatar_url,
            SUM(dc.commits) as total_contributions
          FROM github.author a
          JOIN github.daily_contribution dc ON dc.author_id = a.id
          JOIN github.repository r ON dc.repository_id = r.id
          JOIN github.organization o ON r.owner_id = o.id
          WHERE o.is_active = true
          AND NOT (
            a.login ILIKE ANY(array[${BOT_PATTERNS.map(
              (pattern) => `'%${pattern}%'`
            ).join(", ")}])
            OR a.login ~ '^[A-Za-z0-9-]*bot[A-Za-z0-9-]*$'  -- Matches if 'bot' is part of the name
            OR a.login ~ '^bot[0-9]+$'  -- Matches botXXX pattern
            OR a.login ~ '^[0-9a-f]{40}$'  -- Matches 40-char hex (common for system accounts)
            OR a.login ~ '^app/[A-Za-z0-9-]+$'  -- Matches app/* pattern
          )
          GROUP BY a.id, a.login, a.avatar_url
          HAVING SUM(dc.commits) > 0
          ORDER BY total_contributions DESC
        )
        SELECT json_agg(
          json_build_object(
            'githubId', github_id,
            'avatarUrl', avatar_url,
            'contributions', total_contributions
          )
        ) as contributors
        FROM contributor_stats
      `);

      const contributors: Contributor[] = result.rows[0].contributors || [];

      // Additional JavaScript-side filtering for edge cases
      const filteredContributors = contributors.filter(
        (contributor: Contributor) => {
          const login = contributor.githubId.toLowerCase();
          // Additional checks for patterns that might be hard to catch in SQL
          return (
            !login.includes("automation") &&
            !login.includes("action") &&
            !login.endsWith("-ci") &&
            !login.endsWith("-cd") &&
            !login.startsWith("srv-")
          );
        }
      );

      // Ensure exports directory exists
      const outputDir = path.join(__dirname, "../../../exports");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write contributors.json
      const outputPath = path.join(outputDir, "contributors.json");
      fs.writeFileSync(
        outputPath,
        JSON.stringify(filteredContributors, null, 2)
      );

      console.log(`Found ${contributors.length} total contributors`);
      console.log(
        `Filtered out ${contributors.length - filteredContributors.length} bots`
      );
      console.log(`Contributors data exported to: ${outputPath}`);
    });
  } catch (error) {
    console.error("Failed to export contributors:", error);
    throw error;
  }
}

export { exportContributors };
