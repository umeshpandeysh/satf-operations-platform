# SATF Operations Platform

An internal web operations platform for **South Asia Travel Factory Private Limited (SATF)**.

SATF coordinates India-side travel arrangements for Japanese travellers whose tours are organized through [ST World](https://stworld.jp/). This platform serves as a centralized operational management tool replacing legacy Excel-based tracking sheets (`NEW CHART 2025-2026.xls`), providing reliable tracking of tour records, flight arrivals and departures, day-by-day itineraries, hotel bookings, guide/driver allocations, and operational alerts.

---

## Technology Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Language:** TypeScript (Strict mode)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **State & Architecture:** Decoupled mock domain layer with derived metrics and client components for search/filtering.

---

## Prerequisites

- **Node.js:** v18.18.0 or newer (tested on Node v24.15.0)
- **Package Manager:** `npm` v9+ (or `pnpm` / `yarn`)
- **Git**

---

## Local Development Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/umeshpandeysh/satf-operations-platform.git
   cd satf-operations-platform
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server at `http://localhost:3000` |
| `npm run build` | Compiles an optimized production build with static prerendering |
| `npm run start` | Runs the compiled production server |
| `npm run lint` | Runs ESLint across `app`, `components`, and `lib` directories |
| `npx tsc --noEmit` | Runs TypeScript type checking without emitting files |

---

## Implemented Screens (Phase 1)

### 1. Application Shell & Navigation
- Collapsible responsive sidebar with navigation to Dashboard, Tours, Calendar, Assignments, Reports, and Settings.
- Visual status badges identifying active vs. upcoming module roadmaps.
- Header showing current section title, responsive hamburger navigation, and authenticated operator placeholder.

### 2. Operations Dashboard (`/`)
- **Derived Metrics Cards:** Real-time computed stats relative to current calendar date in India (`Asia/Kolkata`):
  - *Arrivals Today* (e.g. flight arrivals matching the current India date)
  - *Departures Today* (flight departures on the current India date)
  - *Active Tours* (tours currently in-progress across India)
  - *Need Attention* (tours flagged with missing resources or urgent operational blockers)
- **Upcoming Arrivals Table:** Interactive list of arrivals over the next 10 days with relative day indicators ("Today", "Tomorrow", "In N days").
- **Operations Attention Panel:** Instant visibility into critical tour issues (e.g., vehicle breakdowns, unassigned mountain routes, pending hotel confirmations) linking directly to tour records.

### 3. Tours Management & Filter List (`/tours`)
- Multi-field search across booking references (e.g. `SATF-DEMO-001`), Japanese guest/group names, and destinations.
- Status quick-filters: *All*, *Active*, *Upcoming*, *Needs Attention*, *Completed*, *Cancelled*.
- Responsive tour table with pax count, dates, destinations, and direct navigation links.
- Empty states for zero-match search results.

### 4. Tour Detail Page (`/tours/[id]`)
- Comprehensive overview header with booking reference, party composition, arrival/departure dates, and internal operator notes.
- **Operational Itinerary Timeline:** Chronological day-by-day sequence of transfers, sightseeing excursions, activities, and timings.
- **Flight & Transit Legs:** International inbound/outbound flights, airlines, arrival terminals, and schedule times.
- **Resource Allocations:** Current status of assigned guides, drivers, and vehicles (with vehicle registration details and pending badges).
- **Hotel Accommodations:** City stays, check-in/out dates, room types, night counts, and confirmation booking numbers.
- **Special Requests & Dietary Requirements:** Guest preferences (e.g. vegetarian, low-sugar meal requests, ground-floor accessibility) with resolution tracking.
- Clear action affordance indicating editing operations will arrive in Phase 2.

### 5. Roadmap Module Placeholders
- Honest, styled placeholder screens for **Calendar** (`/calendar`), **Assignments** (`/assignments`), **Reports** (`/reports`), and **Settings** (`/settings`) explaining planned features rather than broken dead links.

---

## Known Limitations

- **Demo Data Only:** All tour, passenger, hotel, and flight data is fictional and deterministic for Phase 1 verification.
- **Read-Only Tour Views:** Tour creation, record updates, and resource dispatch actions are reserved for Phase 2.
- **No Backend / Database:** Authentication, multi-tenant roles, and PostgreSQL persistence will be introduced in Phase 3.
- **Legacy Excel Import:** Excel workbook parser and data reconciliation tool will be implemented in Phase 4.

---

## Next Planned Phase

**Phase 2 — Frontend Completion & Interactive Operations:**
- Dynamic tour creation and editing forms with input validation.
- Interactive multi-day calendar view for arrivals, departures, and tour overlays.
- Guide, driver, and vehicle assignment dispatch workbench.
- Printable daily operational manifest and hotel rooming export.
