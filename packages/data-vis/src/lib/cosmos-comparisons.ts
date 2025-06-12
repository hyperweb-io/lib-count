import { PackageComparison } from "./types";

export function getCosmosComparisons(): PackageComparison[] {
  return [
    {
      title: "Cosmos SDK Ecosystems",
      packageGroups: [
        {
          packages: [{ name: "@cosmjs/stargate" }],
          color: "#FF4500",
        },
        {
          packages: [{ name: "@keplr-wallet/cosmos" }],
          color: "#ec4899",
        },
        {
          packages: [{ name: "@cosmos-kit/core" }],
          color: "#6B46C1",
        },
        {
          packages: [{ name: "@interchain-ui/react" }],
          color: "#2596BE",
        },
      ],
    },
    {
      title: "Cosmos Chain Registries",
      packageGroups: [
        {
          packages: [{ name: "chain-registry" }],
          color: "#764ABC",
        },
        {
          packages: [{ name: "@chain-registry/client" }],
          color: "#FF9955",
        },
        {
          packages: [{ name: "@chain-registry/types" }],
          color: "#6366f1",
        },
      ],
    },
    {
      title: "Wallet Connections",
      packageGroups: [
        {
          packages: [{ name: "@cosmos-kit/react" }],
          color: "#FF0000",
        },
        {
          packages: [{ name: "@cosmos-kit/keplr" }],
          color: "#32CD32",
        },
        {
          packages: [{ name: "@cosmos-kit/leap" }],
          color: "#4682B4",
        },
        {
          packages: [{ name: "@cosmos-kit/station" }],
          color: "#8b5cf6",
        },
      ],
    },
    {
      title: "CosmWasm Tools",
      packageGroups: [
        {
          packages: [{ name: "@cosmjs/cosmwasm-stargate" }],
          color: "#29B6F6",
        },
        {
          packages: [{ name: "cosmwasm" }],
          color: "#FF7043",
        },
        {
          packages: [{ name: "@cosmwasm/ts-codegen" }],
          color: "#FFCA28",
        },
      ],
    },
    {
      title: "Cosmos Utilities",
      packageGroups: [
        {
          packages: [{ name: "@cosmjs/amino" }],
          color: "#FF6B6B",
        },
        {
          packages: [{ name: "@cosmjs/crypto" }],
          color: "#4ECDC4",
        },
        {
          packages: [{ name: "@cosmjs/encoding" }],
          color: "#FFD93D",
        },
        {
          packages: [{ name: "@cosmjs/math" }],
          color: "#6C5CE7",
        },
      ],
    },
    {
      title: "DeFi Protocols",
      packageGroups: [
        {
          packages: [{ name: "osmojs" }],
          color: "#61DAFB",
        },
        {
          packages: [{ name: "@osmonauts/lcd" }],
          color: "#41B883",
        },
        {
          packages: [{ name: "juno-network" }],
          color: "#DD0031",
        },
        {
          packages: [{ name: "@stargaze-zone/client" }],
          color: "#FF3E00",
        },
      ],
    },
    {
      title: "Developer Tools",
      packageGroups: [
        {
          packages: [{ name: "@cosmology/telescope" }],
          color: "#06B6D4",
        },
        {
          packages: [{ name: "create-cosmos-app" }],
          color: "#7952B3",
        },
        {
          packages: [{ name: "@cosmology/lcd" }],
          color: "#D36AC2",
        },
      ],
    },
    {
      title: "Testing & DevOps",
      packageGroups: [
        {
          packages: [{ name: "starship" }],
          color: "#8DD6F9",
        },
        {
          packages: [{ name: "@cosmology/core" }],
          color: "#008000",
        },
      ],
    },
  ] as const;
}

// Categories based on TotalStats from stats-db
export function getCosmosCategoryComparisons(): PackageComparison[] {
  return [
    {
      title: "Web3 vs Web2 Packages",
      packageGroups: [
        {
          packages: [
            { name: "@cosmjs/stargate" },
            { name: "@cosmos-kit/core" },
            { name: "chain-registry" },
            { name: "osmojs" },
          ],
          color: "#FF4500",
          baseline: false,
        },
        {
          packages: [
            { name: "react" },
            { name: "express" },
            { name: "lodash" },
          ],
          color: "#2596BE",
          baseline: true,
        },
      ],
    },
    {
      title: "Cosmos Ecosystem Growth",
      packageGroups: [
        {
          packages: [{ name: "@cosmjs/stargate" }],
          color: "#FF0000",
        },
        {
          packages: [{ name: "@cosmos-kit/react" }],
          color: "#32CD32",
        },
        {
          packages: [{ name: "chain-registry" }],
          color: "#4682B4",
        },
        {
          packages: [{ name: "@interchain-ui/react" }],
          color: "#8b5cf6",
        },
      ],
    },
  ] as const;
}
