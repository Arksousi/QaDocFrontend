# Q Desk — Frontend

The modern web application for [Q Desk](../README.md), a unified QA ticket tracking and AI-powered test case & documentation platform. Built with Angular 22 using standalone components, signals, and typed reactive flows.

## Architecture & Apps

Q Desk brings together ticket tracking and AI-powered test case & documentation generation under one unified workspace:

```
/ (Project Menu)
├── /projects/:id   Q Desk (Ticket Tracker)
│                   ├── Projects, Folders & Numbered Tickets
│                   ├── Live State Graph & Full Change History
│                   ├── Rich Text Comments with @Mentions
│                   └── Leader & Users Workload Dashboards
└── Generator Suite (accessible via User Profile Menu under Dashboard)
    ├── /q/qa       TC Generator: AI Test Case Generation
    │               └── Web Crawl / Offline HTML + Groq AI → Structured Test Cases (Passed/Failed → Tickets)
    └── /q/qc       Docs Generator: AI Documentation & User Manuals
                    └── Sequenced Screens + Logo → Software Documentation & User Manuals (.docx / .md / .html)
```

The user menu (top-right avatar) contains direct access to **Projects**, **Dashboard**, **TC Generator**, and **Docs Generator**. Sign-in routes directly to the Project Menu (`/`), and the browser tab title always displays **Q Desk**.

## Key Features

### 1. Q Desk (Ticket Tracker)
- **Folder Structure:** Projects split into logical folders with independent counters (`RMS-V1-0001`).
- **Interactive State Graph:** Visual breadcrumb of the ticket's journey (Open → In Progress → Resolved → Retest → Closed) showing who moved it and exact timestamps.
- **Single Assignee with Capacity Indicators:** Contributor load indicators (`7/9`, amber warning, red cap) with soft warnings.
- **Real-Time Notifications:** Instant top-bar notifications for assignments, mentions, and Retest transitions.
- **Global Search:** Fast debounced search matching title, ticket key, or tags across all visible projects.

### 2. QA Generator (Test Cases)
- **AI-Powered Generation:** Sends screenshots and a business description to Groq or Google Gemini vision models.
- **Categorized Test Cases:** Functional, Negative, Boundary, and UI test cases with priority, preconditions, steps, and expected results.
- **Interactive Execution:** Mark cases as Passed or Failed. One-click conversion from a Failed test case directly into a linked Q Desk ticket.
- **Manual Route & JSON Import:** Pre-rendered copyable prompt for external LLMs (Claude, ChatGPT), with structured JSON import.
- **Clipboard Paste:** Full `Ctrl + V` pasting support for screenshots directly in the creation dialog.

### 3. QC Generator (Software Documentation & User Manuals)
- **Document Type Selection:** Choose between **Software Documentation**, **User Manual**, or **Both Documents** in the creation wizard.
- **Sequenced Screens & Logo:** Sequenced screenshot timeline with captions and step ordering; app logo displayed on document headers.
- **Sequential Vision Pipeline:** Step-by-step screen analysis with live progress bar and step counter.
- **Versioned Markdown:** History of generated or imported drafts, markdown editor, and one-click approval.
- **Multi-Format Export:** Word document (`.docx` with embedded high-res screenshots and table of contents), clean Markdown (`.md`), and printable HTML (`.html`).
- **Clipboard & Drag-and-Drop:** Seamless `Ctrl + V` pasting and drag-and-drop for both app logo and sequenced screenshots.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Angular 22** | Standalone components, signals (`signal`, `computed`), reactive primitives |
| **TypeScript 6** | Strict type safety and models |
| **Playwright** | End-to-end testing, smoke testing, and role permission matrix |
| **Fonts** | JetBrains Mono (code/mono elements) and Manrope (UI typography) |
| **Browser WebP Processing** | Client-side Canvas-based resizing and WebP compression before upload |

## Development

### Prerequisites
- Node.js 20+ (Node 24 recommended)
- npm 10+

### Setup & Run
```bash
# Install dependencies
npm install

# Start development server at http://localhost:4200
npm start
```

The dev server proxies API calls to `http://localhost:5134` (ASP.NET Core Web API).

### Build
```bash
npm run build
```
Production output is compiled into the `dist/QaDocFrontend` directory.

### Testing

```bash
# Run all end-to-end Playwright tests
npm run e2e

# Run targeted test suites
npx playwright test e2e/testcase-generator.spec.ts
npx playwright test e2e/auth.spec.ts

# Run production smoke tests
npm run smoke

# Run full authorization permission matrix
npm run authz
```
