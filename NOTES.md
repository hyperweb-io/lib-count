```sh
yarn
yarn build
cd packages/stats-db
```

Get the Data in the DB:

```sh
./scripts/schema.sh
yarn npm:fetch:packages
yarn npm:fetch:downloads
GITHUB_TOKEN=<redacted> yarn gh:fetch
```

After db is loaded, then (run in any order, they are independent)

```sh
yarn npm:report
yarn npm:badges
yarn npm:readme

yarn gh:report
yarn gh:export
yarn gh:analyze
```

Currently you should delete output/badges

THen copy output/badges/lib-count to output/badges

<LOL> then duplicate output/badges to badges

— we need to update ALL our readmes to clean it up