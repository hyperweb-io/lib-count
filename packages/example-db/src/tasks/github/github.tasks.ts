import { fetchAll } from "./fetch-all";
import { fetchTypes } from "./data-config";
import { generateReport } from "./github.reports";
import { exportContributors } from "./github.exports";

async function runCommand(command: string): Promise<void> {
  console.log(`Executing GitHub task: ${command}`);

  switch (command) {
    case "fetch:all":
      await fetchAll(fetchTypes.all);
      break;
    case "report":
      await generateReport();
      break;
    case "export:contributors":
      await exportContributors();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

if (require.main === module) {
  const command = process.argv[2];
  if (!command) {
    console.error(
      "Please provide a command: fetch:all, report, export:contributors"
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
