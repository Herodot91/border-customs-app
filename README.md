# NCE — Border & Customs Joint Operational Console

A real-time operational simulation dashboard for integrated border control.
Built as a full-stack web application.

---

## Live Demo

**[https://herodot91.github.io/border-customs-app/](https://herodot91.github.io/border-customs-app/)**

> **Login instructions:**
> 1. Fill in name, surname, badge number, select rank and institution
> 2. Choose **Phone OTP** as authentication method
> 3. Enter a Romanian (`+407XXXXXXXX`) or Moldovan (`+373XXXXXXXX`) mobile number
> 4. Click **Send Code** — a 6-digit code appears on screen in the login panel
> 5. Type the code into the field and click **Verify**
>
> _This is a demo application — no real SMS is sent. The access code is displayed directly on screen._

---

## Tech Stack

**Frontend**
- React 19 — component-based UI
- JavaScript (ES2022) — application logic & simulation engine
- HTML5 + CSS3 — structure and custom animations
- Tailwind CSS — utility-first responsive styling

**Backend**
- Node.js — runtime environment
- Express.js — REST API server

**Tooling**
- Vite — fast bundler and dev server
- GitHub Actions — CI/CD pipeline → GitHub Pages

---

## Features

- **Live simulation** — vehicles, declarations, alerts and risk scores update in real time
- **9-module navigation** — Ops Info, Mission, Cooperation, ML Risk, Decision Support, Regression, Governance, KPI Scorecard, ANPR
- **Multilingual UI** — English, Romanian, French, Russian
- **PF / SV case tracking** — Border Police and Customs active incident panels
- **Joint Risk Command** — analyst risk reports filterable by institution
- **KPI Operational Scorecard** — 5 live-computed indicators with colour-coded ratings
- **Demo mode** — guided 7-scenario walkthrough with role selection
- **Responsive dark UI** — custom scrollbars, animated pipeline indicators

---

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Build

```bash
npm run build
```

Deployed automatically to GitHub Pages via GitHub Actions on every push to `main`.
