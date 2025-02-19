import { fetchAll } from "./fetch-all";
import { fetchTypes } from "./data-config";
import { generateReport } from "./github.reports";

async function runCommand(command: string): Promise<void> {
  console.log(`Executing GitHub task: ${command}`);

  switch (command) {
    case "fetch:top3":
      await fetchAll(fetchTypes.top3);
      break;
    case "fetch:top10":
      await fetchAll(fetchTypes.top10);
      break;
    case "fetch:all":
      await fetchAll(fetchTypes.all);
      break;
    case "report":
      await generateReport();
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
      "Please provide a command: fetch:top3, fetch:top10, fetch:all, report"
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
