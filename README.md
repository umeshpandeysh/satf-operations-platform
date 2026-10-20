# SATF Operations Platform

A bilingual operations workspace for South Asia Travel Factory Private Limited (SATF), supporting the coordination of India-side ground arrangements for Japanese travellers whose tours are organized through [ST WORLD](https://stworld.jp/).

The application brings tour records, itineraries, flight and hotel details, resource assignments, operational issues, reports, and workbook reconciliation into one workspace.

- **Production site:** [satf-operations-platform.vercel.app](https://satf-operations-platform.vercel.app)
- **Source repository:** [umeshpandeysh/satf-operations-platform](https://github.com/umeshpandeysh/satf-operations-platform)
- **ST WORLD:** [stworld.jp](https://stworld.jp/)

> **Operational data:** Persistent operations use Supabase. A local installation without the required server-side database configuration cannot save changes to the live database. Use synthetic data for development and demonstrations.

## Contents

- [Overview](#overview)
- [Features](#features)
- [Application routes](#application-routes)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Environment configuration](#environment-configuration)
- [Database setup](#database-setup)
- [Testing and validation](#testing-and-validation)
- [Security and data handling](#security-and-data-handling)
- [Operational notes](#operational-notes)

## Overview

SATF coordinates ground operations for inbound travel in India. Staff need a consistent view of guest groups, travel dates, transport, hotels, guides, drivers, itinerary details, and outstanding requests. This application keeps those details connected to their booking records and supports day-to-day coordination.

The repository contains a Next.js web application, reusable interface components, shared operational rules, API routes, Supabase persistence and schema files, workbook parsing and reconciliation logic, and automated tests.

## Features

### Operations dashboard
- Summary metrics for arrivals, departures, active tours, and records needing attention.
- Upcoming arrival information and links to relevant tour records.
- Visibility into unresolved operational issues and missing arrangements.
- Date-sensitive tour status calculations using India Standard Time (Asia/Kolkata).

### Tour register and details
- Search and filter by booking reference, group, destination, and operational status.
- Tour statuses include upcoming, active, attention, completed, and cancelled.
- Tour records cover guest-group details, passenger counts, destinations, travel dates, flights, hotels, itinerary entries, assignments, special requests, notes, and issues.
- Server-side APIs support tour creation and updates when database configuration is available.
- Validation rules help prevent incomplete assignments and require explanatory notes when resolving issues.
- Cancellation handling and concurrent-update checks help protect existing records.

### Calendar and assignments
- Calendar views for reviewing tour activity across dates.
- Workspace for guide, driver, and vehicle allocations.
- Assignment status tracking and operational conflict checks.
- Responsive layouts for desktop, tablet, and narrow mobile screens.

### Issues and client inquiries
- Issue register for reviewing operational requests, priorities, statuses, and coordinator assignments.
- Search and filtering for requests that need attention.
- Sample inquiry records for interface demonstration; these are not live customer messages.
- Optional inbound email integration code for Microsoft 365 and Google Workspace. Email access remains disconnected until provider credentials and permissions are configured.
- Message sanitization and booking-reference extraction support.

### Reports and exports
- Tours master summary.
- Flight and transfer manifest.
- Resource allocation roster.
- Operational issues and blockers.
- Year/date and status filters where applicable.
- CSV exports with cell sanitization to reduce spreadsheet formula-injection risk.

### Excel import and reconciliation
- Workbook parsing for SATF operations source data.
- Import preview and review endpoints.
- Comparison and decision workflows for records requiring reconciliation.
- Import status and report-export endpoints.
- Explicit commit workflow for applying reviewed changes.
- Validation and recovery logic intended to prevent partial or unintended data changes.

The source workbook used during development is named NEW CHART 2025-2026 (1).xls. The workbook is not required to install the application and should only be stored in approved locations.

### English and Japanese interface
- English and Japanese language options.
- Shared translation dictionary in lib/translations.ts.
- Language preference persisted in browser local storage.
- Localized labels across the main operations views, reports, settings, and import review interface.

### Settings and application shell
- Shared navigation and responsive application layout.
- Reusable interface primitives and consistent design tokens.
- Settings and data-management controls, including workbook import tools.
- SATF brand assets and application icons.

## Application routes

| Route | Purpose |
| --- | --- |
| / | Operations dashboard |
| /tours | Searchable tour register |
| /tours/[id] | Details for an individual tour |
| /calendar | Calendar view |
| /assignments | Guide, driver, and vehicle assignment workspace |
| /issues | Client inquiries and operational issues |
| /reports | Operational summaries and exports |
| /settings | Settings and workbook import/reconciliation tools |

The API is organized under /api and includes authentication/session endpoints, operational tour endpoints, issue endpoints, and import/reconciliation endpoints.

## Technology

| Area | Technology |
| --- | --- |
| Web framework | [Next.js](https://nextjs.org/) App Router |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| UI | [React](https://react.dev/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Database | [Supabase](https://supabase.com/) / PostgreSQL |
| Workbook parsing | [SheetJS](https://sheetjs.com/) via the xlsx package |
| Tests | Node.js test runner through tsx |
| Hosting | [Vercel](https://vercel.com/) |

## Repository layout

~~~text
.
├── app/
│   ├── api/
│   │   ├── auth/                 # Login, logout, and session endpoints
│   │   ├── import/               # Workbook preview, decisions, commit, status, reports
│   │   ├── issues/               # Issue and inquiry API
│   │   └── operations/           # Persistent tour operations API
│   ├── assignments/              # Assignment route
│   ├── calendar/                 # Calendar route
│   ├── issues/                   # Issues route
│   ├── reports/                  # Reports route
│   ├── settings/                 # Settings route
│   ├── tours/                    # Tour register and detail routes
│   ├── globals.css               # Global styling
│   ├── layout.tsx                # Root layout and metadata
│   └── page.tsx                  # Dashboard route
├── components/
│   ├── assignments/              # Assignment workspace
│   ├── calendar/                 # Calendar interface
│   ├── dashboard/                # Dashboard and overview sections
│   ├── issues/                   # Inquiry and issue management
│   ├── layout/                   # Navigation, shell, and footer
│   ├── reports/                  # Reports and CSV exports
│   ├── settings/                 # Settings and Excel import manager
│   ├── tours/                    # Tour register and detail components
│   └── ui/                       # Shared interface primitives
├── docs/
│   └── CHANGE_REGISTER.md        # Feature and verification record
├── lib/
│   ├── auth.ts                   # Authentication and role checks
│   ├── canonical-store.ts         # Canonical operational data access
│   ├── email-issues.ts           # Inbound email integration and issue mapping
│   ├── excel-parser.ts            # Workbook parsing and reconciliation
│   ├── i18n.tsx                   # Language context and switching
│   ├── mock-data.ts               # Sample data for UI/demo use
│   ├── operations.ts              # Shared operational rules and validation
│   ├── operational-store.ts       # Supabase persistence and audit logging
│   ├── operations-client.ts       # Client API helpers
│   ├── session-store.ts           # Session-related client state
│   ├── translations.ts             # English/Japanese dictionary
│   ├── types.ts                    # Shared TypeScript domain types
│   └── utils.ts                    # Date, formatting, and common utilities
├── public/
│   └── brand/                     # SATF logo and brand assets
├── supabase/
│   ├── satf_schema.sql            # Database schema and operational RPC definitions
│   └── phase25_repeat_reference_safe.sql
├── tests/                         # Unit, security, import, localization, persistence tests
├── .env.example                   # Environment variable template
├── middleware.ts                  # Request boundary and route protection
├── next.config.ts                 # Next.js configuration
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
~~~

## Requirements

- Node.js compatible with the installed Next.js version; Node.js 20 or newer is recommended.
- npm.
- Git.
- A Supabase project for persistent operational data.
- Server-side authentication and session configuration for protected operations.

See the [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) for current runtime requirements.

## Run locally

### 1. Clone the repository

~~~bash
git clone https://github.com/umeshpandeysh/satf-operations-platform.git
cd satf-operations-platform
~~~

### 2. Install dependencies

~~~bash
npm install
~~~

### 3. Configure environment variables

Copy the example file.

**PowerShell**

~~~powershell
Copy-Item .env.example .env.local
~~~

**macOS / Linux**

~~~bash
cp .env.example .env.local
~~~

Edit .env.local and supply values appropriate to your environment. Never commit this file.

### 4. Start the development server

~~~bash
npm run dev
~~~

Open [http://localhost:3000](http://localhost:3000).

### 5. Create a production build

~~~bash
npm run build
npm run start
~~~

## Environment configuration

The complete variable list and comments are maintained in [.env.example](.env.example). Common settings include:

| Variable | Purpose |
| --- | --- |
| SUPABASE_URL | Supabase project URL used by server-side persistence |
| SUPABASE_SERVICE_ROLE_KEY | Server-only key used by trusted database operations |
| SATF_SESSION_SECRET | Secret used to sign application session data |
| SATF_COORDINATORS | Optional JSON configuration for individual coordinator accounts and roles |
| SATF_OPERATOR_PASSPHRASE / SATF_ADMIN_PASSPHRASE | Server-side operator passphrase configuration, where supported by the active authentication flow |
| SATF_EMAIL_PROVIDER | Optional inbound email provider selection |
| SATF_EMAIL_USER | Optional operations mailbox address |
| SATF_M365_* | Optional Microsoft 365 application configuration |
| SATF_GWORKSPACE_* | Optional Google Workspace configuration |
| NEXT_PUBLIC_APP_URL | Optional canonical application origin used for origin checks |

Configure only the variables required by the authentication and integration paths enabled in your deployment. Review .env.example and the active server code before changing production settings.

Never expose server secrets through client-side variables. Never paste real credentials into issues, pull requests, chat messages, or documentation. Rotate any credential that has been exposed.

## Database setup

The SQL files under supabase/ define database structures and database-side operations used by the application.

1. Create or select the intended Supabase project.
2. Review supabase/satf_schema.sql before applying it.
3. Apply the schema using the project's approved database administration workflow.
4. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.
5. Verify read access and mutation behavior in a non-production environment before using the application for live operations.

The application uses the satf_operational_tours table for tour records and satf_audit_log for audit entries. The server-side persistence layer maps between the application tour model and PostgreSQL records and records operational changes. Do not run schema or import scripts against a live database without reviewing their effects and obtaining approval.

## Testing and validation

Run the available checks from the repository root:

~~~bash
npm test
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
~~~

- npm test runs the configured operations, parser, security, import review/recovery, localization, issue, and request-boundary tests.
- npm run test:e2e runs persistence end-to-end tests.
- npm run lint runs ESLint over app, components, and lib.
- npx tsc --noEmit checks TypeScript without generating output.
- npm run build creates the optimized Next.js production build.

Tests that require configured services or credentials may need an isolated test environment. Do not point destructive tests at the live operational database.

## Security and data handling

This application may process passenger names, booking details, travel dates, flight information, hotel arrangements, contact messages, and staff assignments.

- Keep Supabase service-role credentials on the server.
- Enforce authentication and role authorization at the server/API boundary; hiding a button in the interface is not access control.
- Keep coordinator and lead-coordinator permissions distinct for privileged operations.
- Validate input on the server and preserve concurrency checks and audit logging.
- Treat inbound email bodies and imported workbook values as untrusted input.
- Use only approved, access-controlled locations for source workbooks and exports.
- Use synthetic data for demonstrations and tests.
- Do not publish operational records, credentials, private passenger details, or production logs in this repository.
- Review every database migration and import commit before running it against live data.

## Operational notes

- The dashboard's date-sensitive metrics use the India calendar date.
- Sample inquiry records are for demonstration and are not proof of a live mailbox connection.
- Inbound email features require provider-specific credentials and permissions; without them, the mailbox integration should remain disconnected.
- Persistent tour changes require a configured server-side Supabase connection.
- Deployment access depends on the authentication and request-protection configuration enabled in the hosting environment.
- The public corporate website and a traveller-facing portal are separate products; this repository contains the internal SATF operations workspace.

---

Maintained for SATF's internal travel coordination workflows.
