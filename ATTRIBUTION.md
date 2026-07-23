# Attribution

## Base project (not mine)
This work extends **career-ops** — an open-source, multi-agent job-search system.

- Repository: https://github.com/santifer/career-ops
- Author / copyright: © 2026 Santiago Fernández de Valderrama (santifer)
- License: MIT
- Version extended: 1.22.0

I did **not** write career-ops. I am not affiliated with its author. This repository does
**not** redistribute career-ops's source code — it contains only my own extensions, which
are designed to live in the project's documented user-extension layer.

## My contribution (this repo)
Built by directing the Claude Code AI agent, as user-layer extensions on top of career-ops:

- The scan dashboard generator (`output/dashboard/gen.mjs`) and its output (`demo.html`).
- The read-only Outlook/Graph "already applied?" plugin (`plugins/outlook-applied/`).
- Scanner coverage and filter customizations (company list, title/location matching) — these
  are configuration changes applied to my own private career-ops instance and are described,
  not redistributed, here.

© 2026 Suraj Natarajan. My extensions are released under the MIT License (see `LICENSE`).

## Honesty note
The case study is explicit about what is mine versus what is the base project's, and about
the fact that an AI agent did the implementation under my direction. Nothing here claims
authorship of career-ops or of any third-party ATS/company.
