export const organizations = ["hyperweb-io", "interweb-inc", "launchql"];

// Map of known forks to their parent repositories
export const knownForks = {
  "hyperweb-io/protobuf.js": "protobufjs/protobuf.js",
  "hyperweb-io/mitosis": "BuilderIO/mitosis",
  // Add more known forks here in format: "org/repo": "parent-org/parent-repo"
};

export const fetchTypes = {
  top3: "top3",
  top10: "top10",
  all: "all",
};
