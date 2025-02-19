# TODO

## NPM data

- [ ] whitelist/blacklist in TS code: whitelist will insert npm packages, blacklist will delete npm packages cascading all foreign keys
- [ ] blacklist: '@chainmos' namespace packages
- [x] refactor schema.sql to npm_schema.sql

## GitHub data

- [ ] whitelist/blacklist in TS code: whitelist will insert npm packages, blacklist will delete npm packages cascading all foreign keys
- [ ] github schema: github_repo.sql
  - [ ] Make sure we have blacklist/whitelist as well
  - [ ] API: given an array of orgs, return all repos, then process further
  - [ ] Find a way to get the fork date of a repo, and use that to filter out the commits from that date
  - [ ] Index contribution per date, data should be as granular as possible
  - [ ] Make a special table to analyze the orgs change for some author id
  - [ ] A link between github orgs, contributors, github repos. i.e. which repos does google have an engineer as a contributor
