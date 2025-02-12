import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { insertNpmDownloadCount, getDownloadsByPackage } from "./queries";

const main = async () => {
  const db = new Database();

  await db.withTransaction(async (client: PoolClient) => {
    // Insert some test data
    await insertNpmDownloadCount(client, {
      packageName: "react",
      date: new Date("2024-01-01"),
      downloadCount: 1000000,
    });

    // Query the data
    const downloads = await getDownloadsByPackage(
      client,
      "react",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    console.log("Downloads:", downloads);
  });
};

main()
  .then(() => console.log("Success!"))
  .catch(console.error);
