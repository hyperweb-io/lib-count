import { execute as fetchPackages } from "./fetch-packages";
import { execute as fetchDownloads } from "./fetch-downloads";
import { generateReport } from "./make-reports";
import * as fs from "fs";
import * as path from "path";

async function runCommand(command: string): Promise<void> {
  console.log(`Executing NPM task: ${command}`);

  switch (command) {
    case "fetch:packages":
      await fetchPackages();
      break;

    case "fetch:downloads":
      await fetchDownloads();
      break;

    case "fetch:downloads:reset":
      await fetchDownloads({ resetDb: true });
      break;

    case "generate:report": {
      const report = await generateReport();
      const reportPath = path.join(__dirname, "../../../exports/npm-report.md");
      fs.writeFileSync(reportPath, report);
      console.log(`Report generated at: ${reportPath}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

if (require.main === module) {
  const command = process.argv[2];
  if (!command) {
    console.error(
      "Please provide a command: fetch:packages, fetch:downloads, or fetch:downloads:reset"
    );
    process.exit(1);
  }

  runCommand(command)
    .then(() => {
      console.log("Command completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Command failed:", error);
      process.exit(1);
    });
}

export { runCommand };
