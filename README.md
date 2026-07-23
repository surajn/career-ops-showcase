# career-ops extensions — a case study in AI-assisted engineering

Extending the open-source [**career-ops**](https://github.com/santifer/career-ops)
multi-agent job-search system with the features my own Engineering-Director / EM
search needed — an operational dashboard, better scanner coverage, and a
least-privilege email design — **without forking it or breaking its upgrade path**.

**▶ [Live demo](https://surajn.github.io/career-ops-showcase/demo.html)**
· **[Case study](https://surajn.github.io/career-ops-showcase/)**

> **Attribution.** The foundation is [career-ops](https://github.com/santifer/career-ops)
> (MIT, © Santiago Fernández de Valderrama) — a system I did **not** write. This repo
> contains only my **extensions** on top of it, built by directing Claude Code. No
> base-project code is redistributed here. See [ATTRIBUTION.md](ATTRIBUTION.md).

## What's here
| Path | What it is |
|------|------------|
| `index.html` | The case study (what / why / how / impact). |
| `demo.html` | Live, offline dashboard on a **sanitized ~24-role public sample**. |
| `output/dashboard/gen.mjs` | The real dashboard generator — a zero-dependency Node script that renders a scan-history TSV into a self-contained HTML page. |
| `plugins/outlook-applied/` | The read-only Microsoft Graph email-check plugin (design + code; dormant). |
| `data/scan-history.tsv` | The sanitized sample dataset (public postings only, no personal status). |
| `writeups/` | LinkedIn post + interview talking points. |

## The engineering, in one paragraph
Every extension lives in **career-ops's user-extension layer** — gitignored paths that
the project's own updater (`update-system.mjs`) is contractually forbidden to touch (its
`USER_PATHS` guard aborts if an update would modify them). The dashboard generator has
**zero imports from system code**, so upstream changes can't break it. That's the whole
point: I could keep pulling upstream updates while my work rode safely alongside. The
same discipline shows up in the least-privilege email design (read-only scope, egress
allow-listed, no password stored) and in a root-cause approach to filter bugs (I traced
*why* real roles were silently dropped before choosing the upgrade-safe fix).

## Run the demo locally
```bash
node output/dashboard/gen.mjs   # reads data/scan-history.tsv → output/dashboard/index.html
```
Open the generated HTML in any browser — no server, no build step, no tokens. (The
committed `demo.html` is that output with a "sample data" banner added.)

## Publish the public page (GitHub Pages)
1. Create a public repo named `career-ops-showcase`, push this folder.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
3. Your public URL: `https://surajn.github.io/career-ops-showcase/`

## License
My extensions: [MIT](LICENSE) © 2026 Suraj Natarajan. Base project career-ops: MIT ©
Santiago Fernández de Valderrama.
