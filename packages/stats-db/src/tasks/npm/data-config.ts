// INPUT
export type Packages = {
  [categoryName: string]: string[];
};

// OUTPUT
export type PackageDownloads = {
  [packageName: string]: number;
};

export type CategoryData = {
  total: number;
  packages: PackageDownloads;
};

export type DownloadsData = {
  [categoryName: string]: CategoryData;
};

export type MergedPackageData = {
  [packageName: string]: {
    category: string;
    total: number;
    weekly: number;
    monthly: number;
    timestamp: number;
  };
};

export type BlacklistConfig = {
  namespaces: string[];
  packages: string[];
};

export const blacklistConfig: BlacklistConfig = {
  namespaces: ["@chainmos"],
  packages: [
    // For some reason, these 2 packages are causing issues with the report generation, these can't be found in npm api
    "@pgsql/deparser",
    "strfy-json",
  ],
};

// Structured as categories with their respective packages
export const packages: Packages = {
  hyperwebjs: [
    "create-hyperweb-app",
    "@hyperweb/cli",
    "hyperwebjs",
    "hyperweb-kit",
    "@hyperweb/build",
    "@hyperweb/ts-json-schema",
  ],
  "interchain-js": [
    "interchainjs",
    "injectivejs",
    "@interchainjs/utils",
    "@interchainjs/types",
    "@interchainjs/auth",
    "@interchainjs/cosmos",
    "@interchainjs/cosmos-msgs",
    "@interchainjs/cosmos-query",
    "@interchainjs/ethereum",
    "@interchainjs/injective",
    "@interchainjs/cosmos-types",
    "@interchainjs/ethermint",
    "injective-query",
    "injective-react",
    "injective-vue",
    "interchain-react",
  ],
  "cosmos-kit": [
    "interchain-kit",
    "@interchain-kit/core",
    "@interchain-kit/react",
    "@interchain-kit/vue",
    "cosmos-kit",
    "@cosmos-kit/core",
    "@cosmos-kit/react",
    "@cosmos-kit/react-lite",
    "@cosmos-kit/walletconnect",
  ],
  "create-cosmos-app": ["create-cosmos-app", "create-interchain-app"],
  "interchain-kit": [
    "interchain-kit",
    "@interchain-kit/core",
    "@interchain-kit/react",
    "@interchain-kit/vue",
  ],
  "interchain-kit-wallets": [
    "@interchain-kit/okx-extension",
    "@interchain-kit/mock-wallet",
    "@interchain-kit/leap-extension",
    "@interchain-kit/ledger",
    "@interchain-kit/coin98-extension",
    "@interchain-kit/leap-mobile",
    "@interchain-kit/keplr-mobile",
    "@interchain-kit/keplr-extension",
    "@interchain-kit/frontier-extension",
    "@interchain-kit/station-extension",
    "@interchain-kit/cosmostation-extension",
    "@interchain-kit/galaxy-station-extension",
    "@interchain-kit/vue",
    "@interchain-kit/cosmos-extension-metamask",
    "@interchain-kit/trust-extension",
    "@interchain-kit/leap-cosmos-extension-metamask",
    "@interchain-kit/xdefi-extension",
  ],
  "cosmos-kit-wallets": [
    "@interchain-kit/okx-extension",
    "@interchain-kit/mock-wallet",
    "@interchain-kit/leap-extension",
    "@interchain-kit/ledger",
    "@interchain-kit/coin98-extension",
    "@interchain-kit/leap-mobile",
    "@interchain-kit/keplr-mobile",
    "@interchain-kit/keplr-extension",
    "@interchain-kit/frontier-extension",
    "@interchain-kit/station-extension",
    "@interchain-kit/cosmostation-extension",
    "@interchain-kit/galaxy-station-extension",
    "@interchain-kit/vue",
    "@interchain-kit/cosmos-extension-metamask",
    "@interchain-kit/trust-extension",
    "@interchain-kit/leap-cosmos-extension-metamask",
    "@interchain-kit/xdefi-extension",

    "@cosmos-kit/frontier-extension",
    "@cosmos-kit/ledger",
    "@cosmos-kit/cosmos-extension-metamask",
    "@cosmos-kit/fin",
    "@cosmos-kit/coin98-extension",
    "@cosmos-kit/okxwallet-extension",
    "@cosmos-kit/trust-mobile",
    "@cosmos-kit/shell",
    "@cosmos-kit/leap-capsule-social-login",
    "@cosmos-kit/cosmostation-extension",
    "@cosmos-kit/vectis",
    "@cosmos-kit/fin-extension",
    "@cosmos-kit/ninji",
    "@cosmos-kit/station-extension",
    "@cosmos-kit/coin98",
    "@cosmos-kit/leap-extension",
    "@cosmos-kit/exodus",
    "@cosmos-kit/trust-extension",
    "@cosmos-kit/leap",
    "@cosmos-kit/xdefi",
    "@cosmos-kit/web3auth",
    "@cosmos-kit/initia-extension",
    "@cosmos-kit/cosmostation",
    "@cosmos-kit/shell-extension",
    "@cosmos-kit/cosmostation-mobile",
    "@cosmos-kit/vectis-extension",
    "@cosmos-kit/station",
    "@cosmos-kit/exodus-extension",
    "@cosmos-kit/leap-mobile",
    "@cosmos-kit/initia",
    "@cosmos-kit/frontier",
    "@cosmos-kit/trust",
    "@cosmos-kit/compass",
    "@cosmos-kit/keplr-mobile",
    "@cosmos-kit/keplr-extension",
    "@cosmos-kit/ninji-extension",
    "@cosmos-kit/compass-extension",
    "@cosmos-kit/xdefi-extension",
    "@cosmos-kit/okxwallet",
    "@cosmos-kit/omni",
    "@cosmos-kit/keplr",
    "@cosmos-kit/omni-mobile",
    "@cosmos-kit/leap-metamask-cosmos-snap",
  ],
  cosmwasm: [
    "@cosmwasm/ts-codegen",
    "@cosmwasm/ts-codegen-types",
    "@cosmwasm/ts-codegen-ast",
    "wasm-ast-types",
    "cosmwasm-typescript-gen",
  ],
  "interchain-ui": ["@interchain-ui/react", "@interchain-ui/vue"],
  telescope: [
    "@cosmology/telescope",
    "@cosmology/lcd",
    "@cosmology/ast",
    "@cosmology/types",
    "@cosmology/utils",
    "@cosmology/proto-parser",

    "@osmonauts/telescope",
    "@osmonauts/lcd",
    "@osmonauts/ast",
    "@osmonauts/utils",
    "@osmonauts/types",
    "@osmonauts/proto-parser",
  ],
  dydx: ["@dydxprotocol/v4-client-js"],
  stargaze: [
    "stargazejs",
    "@stargaze-zone/chain",
    "@stargaze-zone/contracts",
    "stargaze-query",
  ],
  stride: ["stridejs"],
  quicksilver: ["quicksilverjs"],
  juno: ["juno-network", "@juno-network/assets"],
  osmosis: ["@osmonauts/math", "osmojs", "osmo-query"],
  "chain-registry": [
    "@chain-registry/client",
    "@chain-registry/types",
    "@chain-registry/keplr",
    "@chain-registry/cosmostation",
    "@chain-registry/osmosis",
    "@chain-registry/juno",
    "@chain-registry/assets",
    "@chain-registry/utils",
    "chain-registry",
  ],
  cosmology: [
    "cosmjs-utils",
    "@cosmology/cli",
    "@cosmology/core",
    "cosmology",
    "interchain",
    "interchain-query",
    "create-cosmos-app",
    "create-cosmwasm-app",
    "@cosmology-ui/react",
  ],
  starship: ["starshipjs", "@starship-ci/cli", "@starship-ci/client"],
  launchql: [
    "graphile-query",
    "@launchql/graphile-settings",
    // "@launchql/graphile-testing",
    "pg-ast",
    "@launchql/cli",
    "@launchql/server",
    "@launchql/db-templates",
    "@launchql/db-transform",
    "@launchql/ext-achievements",
    "@launchql/ext-jobs-queue",
    "@launchql/ext-jwt-claims",
    "@launchql/ext-types",
    "@launchql/faker",
    "@launchql/inflection",
    "@launchql/totp",
    "@pgql/parse",
    "@pgsql/deparser",
    "@pgsql/enums",
    "@pgsql/parser",
    "@pgsql/types",
    "@pgsql/utils",
    "@pyramation/postgraphile-plugin-fulltext-filter",
    "graphile-column-privileges-mutations",
    "libpg-query",
    "pg-proto-parser",
    "pg-query-native-latest",
    "pg-utils",
    "pgsql-deparser",
    "pgsql-enums",
    "pgsql-parser",
  ],
  protobufs: [
    "@protobufs/cosmos",
    "@protobufs/google",
    "@protobufs/gogoproto",
    "@protobufs/cosmwasm",
    "@protobufs/tendermint",
    "@protobufs/ibc",
    "@protobufs/cosmos_proto",
    "@protobufs/osmosis",
    "@protobufs/secret",
    "@protobufs/juno",
    "@protobufs/akash",
    "@protobufs/regen",
    "@protobufs/pylons",
    "@protobufs/stargaze",
    "@protobufs/bcna",
    "@protobufs/comdex",
    "@protobufs/evmos",
    "@protobufs/axelar",
    "@protobufs/amino",
    "@cosmology/protobufjs",
    "@pyramation/protobufjs",
  ],
  utils: [
    "ast-stringify",
    "nested-obj",
    "strfy-json",
    "schema-typescript",
    "etag-hash",
    "uuid-hash",
    "inquirerer",
    "publish-scripts",
    "skitch-template",
  ],
};

// TODO: remove, this is from web-tools packages data (old)
export const oldPackages = [
  "12factor-env",
  "@chain-registry/assets",
  "@chain-registry/cli",
  "@chain-registry/client",
  "@chain-registry/cosmostation",
  "@chain-registry/interfaces",
  "@chain-registry/juno",
  "@chain-registry/keplr",
  "@chain-registry/osmosis",
  "@chain-registry/types",
  "@chain-registry/utils",
  "@chain-registry/v2",
  "@chain-registry/v2-client",
  "@chain-registry/v2-cosmostation",
  "@chain-registry/v2-types",
  "@chain-registry/v2-utils",
  "@chain-registry/workflows",
  "@chainmos/common",
  "@chainmos/router",
  "@cosmjson/stargaze-minter",
  "@cosmjson/stargaze-sg721",
  "@cosmjson/stargaze-whitelist",
  "@cosmology-ui/react",
  "@cosmology/ast",
  "@cosmology/babel",
  "@cosmology/babel-plugin-transform-bigint",
  "@cosmology/cli",
  "@cosmology/core",
  "@cosmology/cosmjs",
  "@cosmology/cosmos-registry",
  "@cosmology/lcd",
  "@cosmology/proto-parser",
  "@cosmology/protobufjs",
  "@cosmology/protobufs",
  "@cosmology/telescope",
  "@cosmology/ts-codegen-types",
  "@cosmology/types",
  "@cosmology/utils",
  "@cosmonauts/ast-gen",
  "@cosmonauts/auth",
  "@cosmonauts/core",
  "@cosmonauts/cosmjs",
  "@cosmonauts/cosmos",
  "@cosmonauts/cosmos-amino",
  "@cosmonauts/cosmos-cosmjs",
  "@cosmonauts/cosmos-cosmwasm-stargate",
  "@cosmonauts/cosmos-msgs",
  "@cosmonauts/cosmos-proto",
  "@cosmonauts/cosmos-query",
  "@cosmonauts/cosmos-stargate",
  "@cosmonauts/injective",
  "@cosmonauts/interchain",
  "@cosmonauts/osmosis",
  "@cosmonauts/protobuf",
  "@cosmonauts/telescope",
  "@cosmonauts/types",
  "@cosmonauts/utils",
  "@cosmos-kit/coin98",
  "@cosmos-kit/coin98-extension",
  "@cosmos-kit/compass",
  "@cosmos-kit/compass-extension",
  "@cosmos-kit/core",
  "@cosmos-kit/cosmos-extension-metamask",
  "@cosmos-kit/cosmostation",
  "@cosmos-kit/cosmostation-extension",
  "@cosmos-kit/cosmostation-mobile",
  "@cosmos-kit/exodus",
  "@cosmos-kit/exodus-extension",
  "@cosmos-kit/fin",
  "@cosmos-kit/fin-extension",
  "@cosmos-kit/frontier",
  "@cosmos-kit/frontier-extension",
  "@cosmos-kit/galaxy-station",
  "@cosmos-kit/galaxy-station-extension",
  "@cosmos-kit/initia",
  "@cosmos-kit/ins",
  "@cosmos-kit/keplr",
  "@cosmos-kit/keplr-extension",
  "@cosmos-kit/keplr-mobile",
  "@cosmos-kit/leap",
  "@cosmos-kit/leap-extension",
  "@cosmos-kit/leap-metamask-cosmos-snap",
  "@cosmos-kit/leap-mobile",
  "@cosmos-kit/ledger",
  "@cosmos-kit/ninji",
  "@cosmos-kit/ninji-extension",
  "@cosmos-kit/okxwallet",
  "@cosmos-kit/okxwallet-extension",
  "@cosmos-kit/omni",
  "@cosmos-kit/omni-mobile",
  "@cosmos-kit/owallet",
  "@cosmos-kit/owallet-extension",
  "@cosmos-kit/react",
  "@cosmos-kit/react-lite",
  "@cosmos-kit/registry",
  "@cosmos-kit/shell",
  "@cosmos-kit/shell-extension",
  "@cosmos-kit/station",
  "@cosmos-kit/station-extension",
  "@cosmos-kit/tailwind",
  "@cosmos-kit/tailwind-extension",
  "@cosmos-kit/terrastation",
  "@cosmos-kit/terrastation-extension",
  "@cosmos-kit/trust",
  "@cosmos-kit/trust-extension",
  "@cosmos-kit/trust-mobile",
  "@cosmos-kit/vectis",
  "@cosmos-kit/vectis-extension",
  "@cosmos-kit/walletconnect",
  "@cosmos-kit/wallets",
  "@cosmos-kit/web3auth",
  "@cosmos-kit/xdefi",
  "@cosmos-kit/xdefi-extension",
  "@cosmos-wallet/react",
  "@cosmwasm/ts-codegen",
  "@cosmwasm/ts-codegen-ast",
  "@cosmwasm/ts-codegen-types",
  "@interchain-ui/react",
  "@interchain-ui/vue",
  "@interchainjs/auth",
  "@interchainjs/cosmos",
  "@interchainjs/cosmos-msgs",
  "@interchainjs/cosmos-query",
  "@interchainjs/ethereum",
  "@interchainjs/injective",
  "@interchainjs/types",
  "@interchainjs/utils",
  "@interweb-ui/cli",
  "@interweb-ui/compiler",
  "@interweb-ui/react",
  "@interweb/casing",
  "@interweb/fetch-api-client",
  "@interweb/interweb",
  "@interweb/node-api-client",
  "@juno-network/assets",
  "@juno-network/swap",
  "@kubernetesjs/cli",
  "@launchql/ast",
  "@launchql/base32",
  "@launchql/cli",
  "@launchql/db-template",
  "@launchql/db-templates",
  "@launchql/db-transform",
  "@launchql/ext-achievements",
  "@launchql/ext-jobs",
  "@launchql/ext-jobs-queue",
  "@launchql/ext-jwt-claims",
  "@launchql/ext-stamps",
  "@launchql/ext-types",
  "@launchql/ext-uuid",
  "@launchql/faker",
  "@launchql/geo-types",
  "@launchql/inflection",
  "@launchql/proto-cli",
  "@launchql/protobufjs",
  "@launchql/protobufjs-cli",
  "@launchql/totp",
  "@launchql/utils",
  "@mesh-security/types",
  "@osmonauts/ast",
  "@osmonauts/ast-gen",
  "@osmonauts/babel",
  "@osmonauts/helpers",
  "@osmonauts/lcd",
  "@osmonauts/math",
  "@osmonauts/osmosis",
  "@osmonauts/proto-parser",
  "@osmonauts/telescope",
  "@osmonauts/transpiler",
  "@osmonauts/types",
  "@osmonauts/utils",
  "@osmosis-labs/math",
  "@osmosis-labs/pools",
  "@osmosis-labs/proto-codecs",
  "@osmosis-labs/stores",
  "@pgql/parse",
  "@pgsql/enums",
  "@pgsql/parser",
  "@pgsql/protobufjs",
  "@pgsql/protobufjs-cli",
  "@pgsql/types",
  "@pgsql/utils",
  "@protobufs/akash",
  "@protobufs/amino",
  "@protobufs/axelar",
  "@protobufs/bcna",
  "@protobufs/bitsong",
  "@protobufs/canto",
  "@protobufs/comdex",
  "@protobufs/confio",
  "@protobufs/cosmos",
  "@protobufs/cosmos_proto",
  "@protobufs/cosmwasm",
  "@protobufs/cronos",
  "@protobufs/cyber",
  "@protobufs/desmos",
  "@protobufs/evmos",
  "@protobufs/gogoproto",
  "@protobufs/google",
  "@protobufs/ibc",
  "@protobufs/juno",
  "@protobufs/osmosis",
  "@protobufs/pylons",
  "@protobufs/regen",
  "@protobufs/scavenge",
  "@protobufs/stargaze",
  "@protobufs/tendermint",
  "@pyramation/a-test-cosmwasm-module",
  "@pyramation/args",
  "@pyramation/cosmonautsjs",
  "@pyramation/cosmos-telescope-test",
  "@pyramation/graphql-ast",
  "@pyramation/htpasswd",
  "@pyramation/inquirerer",
  "@pyramation/json-schema-ref-parser",
  "@pyramation/json-schema-to-typescript",
  "@pyramation/junesmodule",
  "@pyramation/lernademo",
  "@pyramation/package-merge",
  "@pyramation/pg-query-native",
  "@pyramation/postgraphile-plugin-fulltext-filter",
  "@pyramation/protobufjs",
  "@pyramation/s3-streamer",
  "@pyramation/some-lerna-module",
  "@pyramation/testingnpmmodule",
  "@pyramation/upload-names",
  "@pyramation/url-domains",
  "@stargaze-zone/chain",
  "@stargaze-zone/contracts",
  "@starship-ci/cli",
  "@starship-ci/client",
  "@uni-sign/auth",
  "@uni-sign/cosmos",
  "@uni-sign/cosmos-msgs",
  "@uni-sign/cosmos-query",
  "@uni-sign/ethereum",
  "@uni-sign/injective",
  "@uni-sign/types",
  "@uni-sign/utils",
  "@yamlize/cli",
  "ast-stringify",
  "autosmosis",
  "babel-plugin-icon-property-package-name",
  "babel-slim",
  "backoff-script",
  "badkids",
  "badkidsjs",
  "chain-registry",
  "chain-registry-utils",
  "coolir-commander-utils",
  "cosmjs-utils",
  "cosmology",
  "cosmos-kit",
  "cosmoscript",
  "cosmwasm-typescript-gen",
  "cpbf",
  "create-an-app-test",
  "create-cosmos-app",
  "create-cosmos-appchain",
  "create-cosmos-chain",
  "create-cosmos-contract",
  "create-cosmwasm-app",
  "create-evmos-app",
  "create-ibc-app",
  "create-ibc-chain",
  "create-interchain-app",
  "create-interweb-app",
  "create-juno-app",
  "create-osmosis-app",
  "create-stargaze-app",
  "cwscript",
  "da0da0",
  "da0da0js",
  "daodao",
  "daodaojs",
  "dexmos",
  "dydx",
  "dydxjs",
  "dymensionjs",
  "etag-hash",
  "etag-stream",
  "eve-network",
  "file-ts",
  "genomic",
  "gql-ast",
  "graphile-column-privileges-mutations",
  "graphile-gen",
  "graphile-meta-schema",
  "graphile-query",
  "graphile-search-plugin",
  "graphile-simple-inflector",
  "ibc-script",
  "injectivejs",
  "inquirerer",
  "interchain",
  "interchain-assets",
  "interchain-id",
  "interchain-query",
  "interchain-registry",
  "interchain-rpc",
  "interchain46",
  "interchainjs",
  "interweb",
  "interweb-id",
  "interweb-kit",
  "interweb-query",
  "interweb-registry",
  "interweb-ui",
  "interweb-wallet",
  "interwebjs",
  "json-schema-patch",
  "juno-network",
  "kavajs",
  "kubernetesjs",
  "latex2html5",
  "latex2js",
  "latex2js-macros",
  "latex2js-mathjax",
  "latex2js-pstricks",
  "latex2js-settings",
  "latex2js-utils",
  "latex2vue",
  "launchql-extension-jobs",
  "lerna-module-boilerplate-get",
  "lerna-module-boilerplate-tsx",
  "lerna-submodule-boilerplate-tsx",
  "libpg-query",
  "libpg-query-m1-native",
  "libpg-query-win",
  "lql-protobufjs",
  "mesh-security",
  "nested-obj",
  "omnisign",
  "osmo-query",
  "osmojs",
  "osmojs-bigint",
  "osmojs-react-query",
  "osmojs-tsc-build",
  "pg-ast",
  "pg-deparser",
  "pg-proto-parser",
  "pg-query-native-latest",
  "pg-query-string",
  "pg-utils",
  "pgsql-deparser",
  "pgsql-enums",
  "pgsql-parser",
  "postgraphile-derived-upload-field",
  "publish-scripts",
  "quicksilverjs",
  "schema-sdk",
  "schema-typescript",
  "sdkscript",
  "sigma-streamer-pulse",
  "skitch-template",
  "skitch-transform",
  "stargaze-query",
  "stargaze-zone",
  "stargazejs",
  "starshipjs",
  "stream-to-etag",
  "strfy-js",
  "stridejs",
  "symlink-workspace",
  "teritori",
  "terrascope",
  "teslapi",
  "thorchain",
  "uuid-hash",
  "uuid-stream",
  "wallet-registry",
  "wasm-ast-types",
  "webql-db",
  "yamlize",
];
