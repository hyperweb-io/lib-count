import { vi, describe, it, expect, beforeEach, Mock } from "vitest";
import { generateReadme } from "../src/tasks/npm/npm.reports"; // Adjust path as needed
import { generateReadmeNew } from "../src/tasks/npm/npm.gen-readme"; // Adjust path as needed
import { Database } from "@cosmology/db-client";
import * as fs from "fs";
import * as path from "path";

// Mock the Date constructor to control timestamp generation
const MOCK_DATE = new Date("2024-01-01T12:00:00.000Z");
vi.spyOn(global, "Date").mockImplementation(() => MOCK_DATE);

// Mock the Database class
vi.mock("@cosmology/db-client", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn(() => ({
    query: mockQuery,
    release: vi.fn(),
  }));
  const mockWithTransaction = vi.fn(async (callback) => {
    // Simulate callback execution with a mock client
    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };
    // @ts-ignore
    return callback(mockClient);
  });

  return {
    Database: vi.fn(() => ({
      withTransaction: mockWithTransaction,
      pool: {
        connect: mockConnect,
        end: vi.fn(),
      },
      mockQuery, // Expose mockQuery for configuring responses
      mockWithTransaction, // Expose for direct access in tests if needed
    })),
  };
});

// Mock fs module
vi.mock("fs");
vi.mock("path", async (importOriginal) => {
  const originalPath = await importOriginal<typeof path>();
  return {
    ...originalPath,
    resolve: (...args: string[]) => {
      // Simple mock for path.resolve, adjust if complex paths are needed
      if (args.includes("README_TEMPLATE.md"))
        return "/mock/path/to/README_TEMPLATE.md";
      if (args.includes("package.json")) return "/mock/path/to/package.json";
      if (args.includes("badges")) return "/mock/path/to/badges";
      // Ensure this path mock aligns with how badge files are constructed in generateReadme
      if (
        args.some((arg) => arg.endsWith(".json")) &&
        args.includes("lib-count")
      ) {
        return path.join(
          "/mock/path/to/badges/lib-count",
          args[args.length - 1]
        );
      }
      if (
        args.some((arg) => arg.endsWith(".json")) &&
        args.includes("products")
      ) {
        const parts = args.join(path.sep).split(path.sep);
        const productsIndex = parts.indexOf("products");
        if (productsIndex !== -1 && productsIndex + 1 < parts.length) {
          const category = parts[productsIndex + 1];
          const fileName = parts[parts.length - 1];
          return path.join("/mock/path/to/badges/products", category, fileName);
        }
      }
      return originalPath.join(...args); // Fallback to actual join for other cases
    },
    join: (...args: string[]) => {
      // This join mock needs to be robust enough for generateReadme's path constructions
      if (
        args.includes("lib-count") &&
        args.some((arg) => arg.endsWith(".json"))
      ) {
        return `/mock/path/to/badges/lib-count/${args[args.length - 1]}`;
      }
      if (
        args.includes("products") &&
        args.some((arg) => arg.endsWith(".json")) &&
        args.length > 1 // ensure there's a category
      ) {
        // Assuming format: /mock/path/to/badges, products, category, file.json
        const basePathIndex =
          args.findIndex((arg) => arg.includes("products")) - 1; // index of /mock/path/to/badges
        if (basePathIndex >= 0 && args.length > basePathIndex + 2) {
          const category = args[basePathIndex + 2]; // products is after base, category is after products
          const fileName = args[args.length - 1];
          return `${args.slice(0, basePathIndex + 1).join(path.sep)}${path.sep}products${path.sep}${category}${path.sep}${fileName}`;
        }
      }
      return originalPath.join(...args);
    },
  };
});

const actualReadmeTemplateContent = `
# Hyperweb

<p align="center" width="100%">
   <img src="https://raw.githubusercontent.com/hyperweb-io/.github/refs/heads/main/assets/logo.svg" alt="hyperweb" width="80"><br />
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Ftotal_downloads.json"/>
   </a>
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fmonthly_downloads.json"/>
   </a>
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fweekly_downloads.json"/>
   </a>
   <br>
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Flaunchql_category.json"/>
   </a>
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fhyperweb_category.json"/>
   </a>
   <a href="https://github.com/hyperweb-io/lib-count">
      <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Futils_category.json"/>
   </a>
</p>


## 🚀 Cosmology is Now Hyperweb!

We're thrilled to share that [**Cosmology** has rebranded as **Hyperweb**](https://hyperweb.io/blog/01-28-2025-journey-from-cosmology-to-hyperweb)! 🎉

🔗 **New GitHub Organization:** [**hyperweb-io**](https://github.com/hyperweb-io)
🌐 **New Website:** [**hyperweb.io**](https://hyperweb.io)

📺 **Watch the [Hyperweb Announcement](https://www.youtube.com/watch?v=a_G2_KXRf1Y&list=PL_XyHnlG9MMvekTCbbJArAOwVlkCY54V5&index=2)**


---

# Interchain JavaScript Stack

A unified toolkit for building applications and smart contracts in the Interchain ecosystem with JavaScript.

| [Developer Portal](https://hyperweb.io): Quick Start | [Hyperweb Discord](https://discord.com/invite/xh3ZwHj2qQ): Support & Community | [GitHub Discussions](https://github.com/orgs/hyperweb-io/discussions): Technical Hub |
|:---:|:---:|:---:|

A unified toolkit for building applications and smart contracts in the Interchain ecosystem ⚛️

| Category             | Tools                                                                                                                  | Downloads                                                                                                 |
|----------------------|------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| **Chain Information**   | [**Chain Registry**](https://github.com/hyperweb-io/chain-registry), [**Utils**](https://www.npmjs.com/package/@chain-registry/utils), [**Client**](https://www.npmjs.com/package/@chain-registry/client) | ![Chain Registry](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fchain-registry%2Ftotal.json) |
| **Wallet Connectors**| [**Interchain Kit**](https://github.com/hyperweb-io/interchain-kit)<sup>beta</sup>, [**Cosmos Kit**](https://github.com/hyperweb-io/cosmos-kit) | ![Wallet Connectors](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fcosmos-kit%2Ftotal.json) |
| **Signing Clients**          | [**InterchainJS**](https://github.com/hyperweb-io/interchainjs)<sup>beta</sup>, [**CosmJS**](https://github.com/cosmos/cosmjs) | ![Signers](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fcosmos-kit%2Ftotal.json) |
| **SDK Clients**              | [**Telescope**](https://github.com/hyperweb-io/telescope)                                                          | ![SDK](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Ftelescope%2Ftotal.json) |
| **Starter Kits**     | [**Create Interchain App**](https://github.com/hyperweb-io/create-interchain-app)<sup>beta</sup>, [**Create Cosmos App**](https://github.com/hyperweb-io/create-cosmos-app) | ![Starter Kits](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fcreate-cosmos-app%2Ftotal.json) |
| **UI Kits**          | [**Interchain UI**](https://github.com/hyperweb-io/interchain-ui)                                                   | ![UI Kits](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Finterchain-ui%2Ftotal.json) |
| **Testing Frameworks**          | [**Starship**](https://github.com/hyperweb-io/starship)                                                             | ![Testing](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fstarship%2Ftotal.json) |
| **TypeScript Smart Contracts** | [**Create Hyperweb App**](https://github.com/hyperweb-io/create-hyperweb-app)                              | ![TypeScript Smart Contracts](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fhyperwebjs%2Ftotal.json) |
| **CosmWasm Contracts** | [**CosmWasm TS Codegen**](https://github.com/CosmWasm/ts-codegen)                                                   | ![CosmWasm Contracts](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Fproducts%2Fcosmwasm%2Ftotal.json) |

---

# Interchain JavaScript Stack Announcement

🎥 Watch the [Interchain JS presentation](https://www.youtube.com/watch?v=locvOlLDoVY&list=PL_XyHnlG9MMvekTCbbJArAOwVlkCY54V5&index=1).

<a href="https://www.youtube.com/watch?v=locvOlLDoVY&list=PL_XyHnlG9MMvekTCbbJArAOwVlkCY54V5&index=1">
<img width="400px" src="https://github.com/user-attachments/assets/9d34000e-56ff-4e83-8e4d-612bc79712f4" />
</a>

---

## What Does This Rebrand Mean?

### 🌟 **A Unified Vision**
Hyperweb represents the evolution of Cosmology's mission, focusing on accessibility, innovation, and empowering cross-chain development for everyone.

### 🤝 **Same Great Tools, New Identity**
All the tools and projects you know and love from Cosmology are now part of the Hyperweb ecosystem. Expect the same commitment to open-source collaboration with a fresh perspective.

---

## What's Next?

1. **Explore Hyperweb**
   Visit [**hyperweb-io on GitHub**](https://github.com/hyperweb-io) to find all the tools, repositories, and resources under the new brand.

2. **Follow Our Growth**
   Stay tuned as we continue to innovate and expand the possibilities of cross-chain development with Hyperweb.

3. **Join the Movement**
   Be part of the Hyperweb community and help us shape the future of decentralized technology.

---

### Thank You 💖

To the amazing Cosmology community: thank you for being part of our journey. With Hyperweb, we're taking everything you love to the next level—and we're thrilled to have you with us.

Let's build the future, together. 🚀
`;

describe("README Generation Comparison", () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    mockDb = new Database(); // Get the mock instance of Database to configure mockQuery

    // Mock Date to return a fixed value
    vi.setSystemTime(MOCK_DATE);

    const mockPackageJson = {
      repository: {
        url: "git+https://github.com/hyperweb-io/lib-count.git",
      },
    };
    (fs.readFileSync as Mock).mockImplementation((filePath: string) => {
      if (filePath.includes("package.json")) {
        return JSON.stringify(mockPackageJson);
      }
      if (filePath.includes("README_TEMPLATE.md")) {
        return actualReadmeTemplateContent; // Use the more complete template
      }
      // Mock badge file reads for the old generateReadme
      if (filePath.includes("/badges/lib-count/total_downloads.json"))
        return JSON.stringify({ message: "1,234k" });
      if (filePath.includes("/badges/lib-count/monthly_downloads.json"))
        return JSON.stringify({ message: "123k/month" });
      if (filePath.includes("/badges/lib-count/weekly_downloads.json"))
        return JSON.stringify({ message: "12k/week" });
      if (filePath.includes("/badges/lib-count/cosmology_category.json"))
        return JSON.stringify({ message: "500k downloads" });
      if (filePath.includes("/badges/lib-count/launchql_category.json"))
        return JSON.stringify({ message: "400k downloads" });
      if (filePath.includes("/badges/lib-count/utils_category.json"))
        return JSON.stringify({ message: "334k downloads" });

      const productCategories = [
        "chain-registry",
        "cosmos-kit",
        "telescope",
        "create-cosmos-app",
        "interchain-ui",
        "starship",
        "hyperwebjs",
        "cosmwasm",
      ];
      for (const category of productCategories) {
        if (filePath.includes(`/badges/products/${category}/total.json`)) {
          if (category === "chain-registry")
            return JSON.stringify({ message: "50k" });
          if (category === "cosmos-kit")
            return JSON.stringify({ message: "70k" });
          if (category === "telescope")
            return JSON.stringify({ message: "60k" });
          if (category === "create-cosmos-app")
            return JSON.stringify({ message: "30k" });
          if (category === "interchain-ui")
            return JSON.stringify({ message: "20k" });
          if (category === "starship")
            return JSON.stringify({ message: "10k" });
          if (category === "hyperwebjs")
            return JSON.stringify({ message: "5k" });
          if (category === "cosmwasm") return JSON.stringify({ message: "8k" });
        }
        if (filePath.includes(`/badges/products/${category}/total-num.json`)) {
          // These amounts should align with the 'message' from total.json for consistency if generateReadme uses them for display
          if (category === "chain-registry")
            return JSON.stringify({ amount: 50000 });
          if (category === "cosmos-kit")
            return JSON.stringify({ amount: 70000 });
          if (category === "telescope")
            return JSON.stringify({ amount: 60000 });
          if (category === "create-cosmos-app")
            return JSON.stringify({ amount: 30000 });
          if (category === "interchain-ui")
            return JSON.stringify({ amount: 20000 });
          if (category === "starship") return JSON.stringify({ amount: 10000 });
          if (category === "hyperwebjs")
            return JSON.stringify({ amount: 5000 });
          if (category === "cosmwasm") return JSON.stringify({ amount: 8000 });
        }
        if (filePath.includes(`/badges/products/${category}/monthly.json`)) {
          // Example: derive from total or use fixed values consistent with DB mock for monthly
          if (category === "chain-registry")
            return JSON.stringify({ message: "5k/month" });
          if (category === "cosmos-kit")
            return JSON.stringify({ message: "7k/month" });
          if (category === "telescope")
            return JSON.stringify({ message: "6k/month" });
          if (category === "create-cosmos-app")
            return JSON.stringify({ message: "3k/month" });
          if (category === "interchain-ui")
            return JSON.stringify({ message: "2k/month" });
          if (category === "starship")
            return JSON.stringify({ message: "1k/month" });
          if (category === "hyperwebjs")
            return JSON.stringify({ message: "0.5k/month" });
          if (category === "cosmwasm")
            return JSON.stringify({ message: "0.8k/month" });
        }
        if (filePath.includes(`/badges/products/${category}/weekly.json`)) {
          // Example: derive from monthly or use fixed values consistent with DB mock for weekly
          if (category === "chain-registry")
            return JSON.stringify({ message: "0.5k/week" });
          if (category === "cosmos-kit")
            return JSON.stringify({ message: "0.7k/week" });
          if (category === "telescope")
            return JSON.stringify({ message: "0.6k/week" });
          if (category === "create-cosmos-app")
            return JSON.stringify({ message: "0.3k/week" });
          if (category === "interchain-ui")
            return JSON.stringify({ message: "0.2k/week" });
          if (category === "starship")
            return JSON.stringify({ message: "0.1k/week" });
          if (category === "hyperwebjs")
            return JSON.stringify({ message: "50/week" });
          if (category === "cosmwasm")
            return JSON.stringify({ message: "80/week" });
        }
      }
      console.warn(`fs.readFileSync called with unmocked path: ${filePath}`);
      return ""; // IMPORTANT: Default to empty string for unhandled paths to cause JSON.parse error if unexpected.
    });
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.mkdirSync as Mock).mockReturnValue(undefined);
    (fs.writeFileSync as Mock).mockImplementation((path, data) => {
      // console.log(`Mock fs.writeFileSync called for ${path}`);
    });
    (fs.readdirSync as Mock).mockImplementation(
      (dirPath: string | Buffer | URL) => {
        if (String(dirPath).includes("products")) {
          return [
            // These are directory names
            "chain-registry",
            "cosmos-kit",
            "telescope",
            "create-cosmos-app",
            "interchain-ui",
            "starship",
            "hyperwebjs",
            "cosmwasm",
          ];
        }
        return [];
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers
  });

  it("should produce the same README content", async () => {
    mockDb.mockQuery.mockImplementation((queryText: string, params: any[]) => {
      // Mock for getPackageStats
      if (queryText.includes("MIN(date) as oldest_date")) {
        return Promise.resolve({
          rows: [
            {
              oldest_date: "2023-01-01",
              latest_date: "2024-01-01",
              days_since_update: 5,
            },
          ],
        });
      }
      if (
        queryText.includes(
          "COALESCE(SUM(d.download_count), 0) as total_downloads"
        ) &&
        !queryText.includes("total_lifetime_downloads")
      ) {
        const pkgName = params[0];
        // This data needs to be the source of truth for generateReadmeNew
        // The fs mocks for badge files for generateReadme (old) should reflect these numbers.
        if (pkgName === "chain-registry")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 50000,
                monthly_downloads: 5000,
                weekly_downloads: 500,
              },
            ],
          });
        if (pkgName === "cosmos-kit")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 70000,
                monthly_downloads: 7000,
                weekly_downloads: 700,
              },
            ],
          });
        if (pkgName === "telescope")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 60000,
                monthly_downloads: 6000,
                weekly_downloads: 600,
              },
            ],
          });
        if (pkgName === "create-cosmos-app")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 30000,
                monthly_downloads: 3000,
                weekly_downloads: 300,
              },
            ],
          });
        if (pkgName === "interchain-ui")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 20000,
                monthly_downloads: 2000,
                weekly_downloads: 200,
              },
            ],
          });
        if (pkgName === "starship")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 10000,
                monthly_downloads: 1000,
                weekly_downloads: 100,
              },
            ],
          });
        if (pkgName === "hyperwebjs")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 5000,
                monthly_downloads: 500,
                weekly_downloads: 50,
              },
            ],
          });
        if (pkgName === "cosmwasm")
          return Promise.resolve({
            rows: [
              {
                package_name: pkgName,
                total_downloads: 8000,
                monthly_downloads: 800,
                weekly_downloads: 80,
              },
            ],
          });
        // Fallback for any other packages in data-config or uncategorized
        return Promise.resolve({
          rows: [
            {
              package_name: pkgName,
              total_downloads: 1000,
              monthly_downloads: 100,
              weekly_downloads: 10,
            },
          ],
        });
      }
      // Mock for getLifetimeDownloadsByCategory
      if (queryText.includes("total_lifetime_downloads")) {
        // This query fetches all packages. The sum of these 'total_downloads' will be the 'total_lifetime_downloads'.
        // And will also be used to populate the categoryStatsMap in generateReadmeNew
        return Promise.resolve({
          rows: [
            // These should represent *all* packages that would be processed
            // Web3 (hyperweb, cosmology, interchain)
            {
              package_name: "chain-registry",
              total_downloads: 50000,
              monthly_downloads: 5000,
              weekly_downloads: 500,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "cosmos-kit",
              total_downloads: 70000,
              monthly_downloads: 7000,
              weekly_downloads: 700,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "telescope",
              total_downloads: 60000,
              monthly_downloads: 6000,
              weekly_downloads: 600,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "create-cosmos-app",
              total_downloads: 30000,
              monthly_downloads: 3000,
              weekly_downloads: 300,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "interchain-ui",
              total_downloads: 20000,
              monthly_downloads: 2000,
              weekly_downloads: 200,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "starship",
              total_downloads: 10000,
              monthly_downloads: 1000,
              weekly_downloads: 100,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "hyperwebjs",
              total_downloads: 5000,
              monthly_downloads: 500,
              weekly_downloads: 50,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "cosmwasm",
              total_downloads: 8000,
              monthly_downloads: 800,
              weekly_downloads: 80,
              total_lifetime_downloads: 1234000,
            },
            // Simulate some other packages for categories if they exist in your data-config
            // For LaunchQL (web2) - assuming a few packages
            {
              package_name: "@launchql/pkg1",
              total_downloads: 200000,
              monthly_downloads: 20000,
              weekly_downloads: 2000,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "@launchql/pkg2",
              total_downloads: 200000,
              monthly_downloads: 20000,
              weekly_downloads: 2000,
              total_lifetime_downloads: 1234000,
            },
            // For Utils - assuming a few packages
            {
              package_name: "@utils/pkg1",
              total_downloads: 150000,
              monthly_downloads: 15000,
              weekly_downloads: 1500,
              total_lifetime_downloads: 1234000,
            },
            {
              package_name: "@utils/pkg2",
              total_downloads: 184000,
              monthly_downloads: 18400,
              weekly_downloads: 1840,
              total_lifetime_downloads: 1234000,
            },
            // Ensure that the sum of total_downloads here roughly matches the badge values and total_lifetime_downloads used.
            // The generateReadme relies on generateBadges which computes totals. generateReadmeNew computes them from DB.
          ],
        });
      }
      console.warn(
        `mockDb.mockQuery called with unhandled query: ${queryText}`
      );
      return Promise.resolve({ rows: [] });
    });

    const oldReadmeContent = await generateReadme();
    const newReadmeContent = await generateReadmeNew();

    if (oldReadmeContent !== newReadmeContent) {
      console.log("--- OLD README DEBUG ---");
      // console.log(oldReadmeContent);
      console.log("--- NEW README DEBUG ---");
      // console.log(newReadmeContent);
      fs.writeFileSync("old_readme_debug.md", oldReadmeContent || "", "utf8");
      fs.writeFileSync("new_readme_debug.md", newReadmeContent || "", "utf8");
    }

    expect(newReadmeContent).toEqual(oldReadmeContent);
  });
});
