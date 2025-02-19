# TODO

## NPM data

- [x] 1. whitelist/blacklist in TS code: whitelist will insert npm packages, blacklist will delete npm packages cascading all foreign keys
- [x] 2. blacklist: '@chainmos' namespace packages
- [x] 3. refactor schema.sql to npm_schema.sql

## GitHub data

- [ ] 1. whitelist/blacklist in TS code: whitelist will insert npm packages, blacklist will delete npm packages cascading all foreign keys
- [ ] 2. github schema: github.sql
- [ ] 3. Make sure we have blacklist/whitelist as well
- [ ] 4. API in Typescript side: given an array of orgs, return all repos, then process further
- [ ] 5. Find a way to get the fork date of a repo, and use that to filter out the commits from that date
- [ ] 6. Index contribution per date, data should be as granular as possible
- [ ] 7. Make a special table to analyze the orgs change for authors (only contributors to the orgs in context) .i.e. which orgs that a contributor is associated with and what orgs change over time for that author
- [ ] 8. Analize a link between github orgs, contributors, github repos i.e. For example which repos does google have an engineer as a contributor
- [ ] 9. Make a report of the data
