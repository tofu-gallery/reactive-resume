# Reactive Resume

Resume and job-search help for your AI agent, built around [Reactive Resume](https://rxresu.me), the free and open-source resume builder. The plugin bundles 32 skills and the Reactive Resume MCP server. Write from pasted text, build a resume for your profession, or connect your account to read and edit resumes, cover letters and applications.

## Resume writing and review

| Skill                      | What it does                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `resume-writer`            | Writes a complete resume, headline or summary as copy-ready text.                                      |
| `resume-builder`           | Builds a new resume as Reactive Resume JSON, asking for missing facts.                                 |
| `resume-content-guide`     | Decides what belongs on a resume for your situation, country and industry, and audits an existing one. |
| `accomplishment-inventory` | Recovers real achievements and builds an evidence bank before drafting.                                |
| `resume-bullet-writer`     | Turns duties into impact bullets, asking for real numbers or honest ranges.                            |
| `resume-tailor`            | Fits one resume to one job posting on a copy, with gap questions and an optional cover letter.         |
| `resume-proofreader`       | Edits grammar, clarity and consistency without changing facts or voice.                                |
| `entry-level-resume`       | Builds a first-job resume from study, projects, placements and part-time work.                         |
| `career-change-resume`     | Makes transferable experience clear while preserving past titles and context.                          |
| `academic-cv`              | Organizes scholarship, teaching, funding and service with exact status and authorship.                 |

## Resumes by role

Each role skill writes a complete draft or the requested sections. It asks questions specific to that profession, explains which evidence matters and includes a worked example. Role guidance supplies useful defaults; the employer's instructions and your actual experience take precedence.

| Skill                      | Roles and focus                                                                |
| -------------------------- | ------------------------------------------------------------------------------ |
| `software-engineer-resume` | Frontend, backend, mobile, platform, DevOps, SRE and security engineering.     |
| `data-resume`              | Analytics, data engineering, data science and machine learning.                |
| `product-manager-resume`   | Discovery, prioritization, product decisions and outcomes.                     |
| `designer-resume`          | Product, UX/UI, research, service and visual design.                           |
| `marketing-resume`         | Growth, performance, lifecycle, brand, content and communications.             |
| `sales-resume`             | SDR/BDR, account executives, sales engineering and sales leadership.           |
| `customer-success-resume`  | Adoption, onboarding, implementation, renewals and support.                    |
| `project-manager-resume`   | Project, program, delivery and PMO responsibilities.                           |
| `operations-resume`        | Supply chain, logistics, manufacturing, maintenance, retail and hospitality.   |
| `finance-resume`           | Accounting, audit, FP&A, treasury, banking and investments.                    |
| `healthcare-resume`        | Nursing, allied health, clinical support and administration.                   |
| `educator-resume`          | Teaching, educational leadership, instructional design and workplace learning. |
| `executive-resume`         | Director, VP, C-suite and board-candidate records.                             |
| `technical-writer-resume`  | Technical writing, developer documentation and knowledge management.           |

## Supporting content and the job search

| Skill                     | What it does                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `cover-letter-writer`     | Writes a standalone letter or application email from the same career facts.                             |
| `application-answers`     | Drafts form answers and selection-criteria statements within supplied limits.                           |
| `linkedin-profile-writer` | Writes public profile copy consistent with your resume and disclosure preferences.                      |
| `portfolio-case-study`    | Expands a real project into a narrative of decisions, contribution and results.                         |
| `job-application-manager` | Tracks applications, stages, follow-ups and the resume version you sent, and drafts messages.           |
| `interview-prep`          | Builds a story bank, a company brief and likely questions for a specific interview, then debriefs it.   |
| `mock-interview`          | Plays the interviewer for a specific job and scores your answers with quotes.                           |
| `offer-negotiation`       | Decodes an offer, plans one counter, drafts the email and call script, and rehearses the call with you. |

Start with the deliverable: resume-writer for text, resume-builder for importable JSON, a role skill for professional emphasis, or resume-tailor for a specific posting. Use resume-content-guide to decide what belongs and resume-proofreader to polish what is already written. Each skill works independently; installing the collection makes related workflows available without making them prerequisites.

The skills never invent employers, dates, numbers or results. They keep estimates approximate and separate learning, planned work and team contributions from completed individual achievements. Drafting does not submit applications or publish profiles. Connected changes require review and authorization.

## MCP server

The plugin connects to `https://rxresu.me/mcp`. The first time a skill needs your data, your agent asks you to sign in to Reactive Resume and approve access; no API key is stored in the plugin. Without signing in, the skills still work on text you paste.

Your agent's provider processes the text you give it under its own terms. Connected tools read and save data in your Reactive Resume account under its [privacy policy](https://docs.rxresu.me/legal/privacy-policy). Tools that use AI (match scores, tailored summaries, drafted messages) also send data to the AI provider you configured in Reactive Resume; the skills ask before calling them. They do not upload your resume to outside scanners or publish private work samples without authorization.

Self-hosting Reactive Resume? Install the skills on their own and connect your own server instead: `npx add-mcp <your-app-url>/mcp --name reactive-resume`.

## Install

Claude Code:

```sh
claude plugin install reactive-resume --marketplace reactive-resume/reactive-resume
```

Codex:

```sh
codex plugin marketplace add reactive-resume/reactive-resume
codex plugin add reactive-resume@reactive-resume
```

Then ask in plain language, for example "Tailor my resume to this job posting" or "Mock interview me for this role". Full guide: [Using agent skills](https://docs.rxresu.me/guides/using-agent-skills).

## Inspiration

The expanded writing collection draws on [ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) and other open writing skills. [Sources and adaptation notes](SOURCES.md) record the reviewed snapshots, useful ideas and advice deliberately left out. The new instructions and examples are written for this collection; they are not copies of upstream templates.

## License

MIT
