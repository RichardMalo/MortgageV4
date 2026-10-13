# ⌂ TrueMortgage
> **A Clean, Fast, Mortgage-Only Calculator**  
> *100% Client-Side | Pure Browser Architecture | Zero Tracking or Cloud Storage*

---

### 🌐 **LIVE LINK (GitHub Pages):**
## 🚀 [**Launch TrueMortgage on GitHub Pages**](https://richardmalo.github.io/MortgageV4/)
> **Direct URL:** [https://richardmalo.github.io/MortgageV4/](https://richardmalo.github.io/MortgageV4/)  

---

## 📑 Overview

TrueMortgage is built exclusively for **mortgages**. It cuts out unnecessary debt consolidation tools, credit card sliders, and convoluted multi-pane dashboards in favor of an intuitive, clean interface that provides immediate, actionable answers.

### Core Features

- **Focused solely on Mortgages**:
  - Buying a Home (Price & Down Payment)
  - Existing Mortgage (Current Balance & Remaining Years)
- **Automatic Regional Calculations**:
  - **Canada**: Semi-annual compounding and Dec 2024 CMHC insurance rules with tier validations.
  - **United States**: Monthly compounding and statutory Private Mortgage Insurance (PMI) automatic cancellation at 78% LTV.
  - **United Kingdom & Australia**: Localized labels, currency formatting, and compounding conventions.
- **Pay It Off Faster**:
  - Test extra monthly payments or annual lump sums on loan anniversaries.
  - See exact interest saved and real calendar time shaved off your mortgage.
- **Complete Housing Cost View**:
  - Optional property taxes, home insurance, and condo/HOA/strata fees for accurate monthly budgeting.
- **Interactive Multi-Graph Carousel (8 High-DPI Views)**:
  - **Balance Over Time**: Plan vs. baseline comparison curve with interactive scrubbing.
  - **Money Kept**: Cumulative interest race showing the widening green savings gap.
  - **Tipping Point**: Monthly interest vs. principal crossover date when more of each payment goes to you than the bank.
  - **Extra Payment Sensitivity**: Interactive curve showing interest and years saved; click any point to set your payment.
  - **Strategy Leaderboard**: Side-by-side comparison of accelerated bi-weekly, +10%/+25%/Double-Up, extra monthly, and lump sum, with 1-click apply.
  - **Cost of Waiting**: Real dollar cost of delaying prepayments by 1, 2, 3, or 5 years.
  - **Lifetime Breakdown & Cash Flow**: Stacked total cost and calendar year allocation.
  - Interactive scrubbing, touch swipe, zoom enlargement, and live plain-English takeaway captions on every slide.
- **Full Schedule & CSV Export**:
  - Yearly milestone view (5-Yr Renewal, Tipping Point, 50% Equity, Debt-Free).
  - Detailed payment-by-payment monthly breakdown with one-click CSV export.

---

## 🚀 Development & Testing

### Prerequisites
- Node.js &ge; 20.0.0
- npm &ge; 10.0.0

### Run Tests
```bash
npm test
```

### Build Production Bundle
```bash
npm run build
```

---

## 🛡️ Privacy & Performance
- **Zero-Cloud, 100% Client-Side**: No financial data is ever collected or transmitted.
- **Lightweight**: Zero external UI/charting dependencies.
