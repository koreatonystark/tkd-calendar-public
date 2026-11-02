# TKD Calendar Hub PUBLIC website

This repository publishes only the generated TKD Calendar Hub website, tournament details and public ICS feeds. Never commit private source data, Google credentials, SSH keys or crawler administration files here.

- GitHub Pages: Settings > Pages > Build and deployment > Source: GitHub Actions.
- The private administration repository updates this site through a repository-scoped deploy key.
- Do not manually edit generated feeds or event detail pages; the next refresh replaces them.
- Titles use a single classification prefix, such as `[TKD S] ATA 2027 Spring Nationals`.
- Forecast status is in the event description, not in the title.
- Classification and federation labels are editorial, not claims of official sanctioning grades.
