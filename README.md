# ⌂ TrueMortgage
> **An Atelier-Grade, Private Mortgage Calculator**  
> *Minimalist Luxury | High Horology Precision | 100% Client-Side | Zero Tracking or Cloud Storage*

---

### 🌐 **LIVE LINK (GitHub Pages):**
## 🚀 [**Launch TrueMortgage on GitHub Pages**](https://richardmalo.github.io/MortgageV4/)
> **Direct URL:** [https://richardmalo.github.io/MortgageV4/](https://richardmalo.github.io/MortgageV4/)  

---

## 📑 Overview

**TrueMortgage** is built exclusively for **mortgages**. It cuts out debt consolidation clutter, credit card sliders, and convoluted multi-pane dashboards in favor of an architecturally clean, fast, and elegant interface that provides immediate, actionable answers for homebuyers and homeowners alike.

Designed with a **Prada-grade minimalist luxury aesthetic** and zero external UI/charting dependencies, it delivers instant calculations with microsecond performance and complete client-side privacy.

---

## ✨ Key Features & Recent Updates

### 🏛️ Prada-Grade "Mortgage Horizons" Executive Showcase
- **Executive Milestone Cards**: A dedicated gallery located directly above the schedule showcasing the 4 seminal financial landmarks of your mortgage journey:
  - **↺ 5-Yr Term Renewal**: Remaining balance, cumulative principal paid down, equity percentage built, and fixed-term renewal checkpoint.
  - **⚖ The Tipping Point**: The critical inflection date and annual dollar breakdown where principal repayment overtakes bank interest.
  - **½ 50% Equity Landmark**: The exact date when the original loan balance is cut in half, marking accelerated equity momentum.
  - **★ Mortgage-Free Destiny**: Final payoff date, $0.00 balance, total interest paid, and cumulative interest saved.
- **Interactive Tap-to-Locate**: Clicking or tapping any milestone card smoothly scrolls the schedule table directly to that landmark year/month and illuminates the row with a transient luxury halo glow (`milestone-row-highlight`).
- **Responsive Dual Presentation**: Expands into an executive 4-column runway gallery on desktop and arranges into a compact, zero-scroll 2×2 grid on mobile screens.

### 📱 Flawless Mobile Schedule Optimization
- **Zero Horizontal Overflow**: The 5-column annual schedule (`Year`, `Interest`, `Principal`, `Extra`, `Balance`) and 7-column payment schedule fit comfortably on phone screens without horizontal scrolling.
- **Micro-Jewel Pips & Left Accents**: Compact indicator pips (`↺`, `⚖`, `½`, `★`), desktop milestone badges, and signature left-border jewel accents (sapphire, emerald, amber, mint) highlight milestone rows cleanly.
- **Responsive Date Typography**: Automatically locks full 4-digit years (`Nov 2026`) on desktop and compact short years (`Nov '26`) on mobile with high-specificity stylesheet rules.

### ⚡ Prepayment Privilege Suite (TD Payment Increase & RBC Double-Up)
- **Payment Increase Privilege**: Interactive toggle and custom payment input to simulate lender-specific annual payment increase privileges.
- **Quick-Action Chips**: One-tap presets for **Base**, **+10%**, **+25%**, and **Double-Up (2×)**.
- **Prepayment Limits**: Live range hints showing base contractual payment and lender penalty-free caps.

### 📊 Interactive 8-Slide Retina Chart Suite
Zero-dependency custom Canvas charting engine with responsive touch-swipe, hover scrubbing, interactive tooltips, and plain-English takeaway captions:
1. **Balance Over Time**: Plan vs. baseline payoff curves with interactive balance inspection.
2. **Money Kept**: Cumulative interest race illustrating the widening green savings gap.
3. **Tipping Point**: Month-by-month principal vs. interest crossover curve.
4. **Extra Payment Sensitivity**: Curve of interest and years saved; click any point to set your payment.
5. **Strategy Comparison**: Side-by-side leaderboard (Accelerated Bi-Weekly, +10%, +25%, Double-Up, Extra Monthly, Lump Sum) with 1-click apply.
6. **Cost of Waiting**: Real dollar cost of delaying prepayments by 1, 2, 3, or 5 years.
7. **Lifetime Breakdown**: Stacked interactive cost allocation (Principal, Interest, Extra).
8. **Annual Cash Flow**: Year-by-year cash allocation bars.
- **Chart Zoom / Enlarge**: Fullscreen expansion toggle (`+` / `−`) for deep analysis on any screen size.

### 🌎 Automatic Multi-Regional Rules
- **Canada (CA)**: Semi-annual compounding and statutory CMHC mortgage loan insurance rules with tier validations.
- **United States (US)**: Monthly compounding and automatic Private Mortgage Insurance (PMI) cancellation at 78% LTV.
- **United Kingdom (UK) & Australia (AU)**: Localized terminology, stamp duty / fee conventions, and currency formatting.

### 🌓 Milanese Atelier Design System
- **Theme Switching**: Dark and Light themes with automatic system detection, manual toggle, and localStorage persistence.
- **Complete Housing Cost View**: Property taxes, home insurance, and condo/HOA/strata fees for realistic monthly cash flow budgeting.
- **Data Portability**: One-click full schedule CSV export, print-ready statement mode (`@media print`), and URL plan sharing.

---

## 🚀 Development & Testing

### Prerequisites
- Node.js &ge; 20.0.0
- npm &ge; 10.0.0

### Install Dependencies
```bash
npm install
```

### Start Local Development Server
```bash
npm run dev
```

### Run Vitest Test Suite
```bash
npm test
```

### Build Production Bundle
```bash
npm run build
```

---

## 🛡️ Privacy & Performance

- **Zero Cloud Storage**: All calculations run 100% locally in your browser.
- **Zero Tracking**: No analytics, cookies, or remote data transmission.
- **Instantaneous**: Zero heavy runtime frameworks or external charting dependencies.
