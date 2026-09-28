# 🌌 TrueMortgage Studio (v4.0 / MTGV4.0)
> **Institutional-Grade Debt Elimination Engine & Cross-Platform Financial Studio**  
> *100% Client-Side Pure Browser Architecture | Zero-Trust Privacy | Hardware-Accelerated Micro-Visualizations*

---

## 📑 Overview & The "Cockpit Dilemma" Solution

While **TrueMortgage v3.1.0** established institutional mathematical rigor (Canadian Bank Act compounding, OSFI B-20 stress tests, Dec 2024 reforms, CMHC tiers, TILA IRR solvers, and multi-debt cascades), its user interface suffered from the **"Cockpit Dilemma"**: cognitive overload from 30+ stacked inputs, monolithic code (2,687-line `index.html` and 4,700-line stylesheet), and heavy Plotly.js charts (~3MB bundle with mobile touch collisions).

**TrueMortgage Studio v4.0 (MTGV4.0)** reimagines the entire engine from the ground up:

| Dimension | Previous v3.1.0 Engine | Reimagined v4.0 Studio |
| :--- | :--- | :--- |
| **UX Paradigm** | Single-page "cockpit" with 30+ stacked inputs & 12 heavy charts | **Progressive Disclosure** (1. The Pulse &rarr; 2. Strategy Lab &rarr; 3. The Engine Room) |
| **Mobile Experience** | Compressed desktop layout with horizontal scroll friction | **Mobile-First Touch Ergonomics** (Bottom dock, thumb drawers, swipeable carousel) |
| **Charting Engine** | Heavy Plotly.js (~3MB bundle, canvas touch traps) | **Hardware-Accelerated Canvas/SVG Micro-charts (<150KB total bundle)** |
| **Interaction Model** | Discrete input fields with periodic triggers | **Continuous "What-If" Scrubbers** (Zero-latency slider sweep, 120fps fluid feedback) |
| **Debt Portfolio** | Siloed modes (Mortgage OR Credit Card OR Multi-Debt) | **Unified Household Balance Sheet** (Mortgage + Cards + Auto with Mortgage Rollover) |
| **Regional Features** | US & Canada statutory rules, UK SDLT, AU Stamp Duty | **Adds AU/UK Mortgage Offset Accounts & Redraw Facilities** |
| **Sync & Handoff** | Manual Base64 export strings | **Encrypted Zero-Knowledge QR Handoff** (Mac &harr; iPhone P2P sync with zero servers) |
| **Guidance** | Static help tooltips | **Local Rule-Based "AI Financial Copilot"** (Real-time actionable heuristics) |

---

## 🏛️ 1. The 3-Tier Progressive Disclosure System

### **Stage 1: The Pulse (Casual / Quick Estimation)**
- **3 Primary Dials**:
  1. *Balance Dial*: Direct scrub of mortgage/debt liability.
  2. *Interest Rate Dial*: Contract APR.
  3. *Discretionary Target*: Discretionary extra monthly cash flow.
- **Kinetic Hero Readout**: Dynamic real-time readout of Total Projected Savings, exact Debt-Free Date, Years Shaved, and Monthly Payment.

### **Stage 2: Strategy Lab (Interactive Optimization)**
- **The Living Balance Arc**: Replaces concentric circles with an interactive split-ring gauge balancing Principal Financed against Lifetime Bank Interest Drag, complete with a dollar-scrubber showing equity vs. bank interest allocation for any payment date.
- **Amortization Trajectory Micro-Chart**: Dual-curve high-DPI canvas overlay comparing Baseline Amortization vs. Strategy Curve, with a red renewal boundary marker and debt-free pin.
- **Opportunity Cost Split-Screen**: Projects Net Worth under Debt Prepayment vs. S&P 500 Index Compounding, identifying exact crossover years.
- **Career Labor Converter ("Bank Wages")**: Translates interest dollars into concrete life metrics:
  - *Freedom Day Horizon*: The exact day of the month when you stop working for the bank and start working for your own equity.
  - *Bank Labor*: Working days and years dedicated solely to bank profit.
  - *Dead Rent Equivalent*: Annual interest expressed as monthly dead rent.

### **Stage 3: The Engine Room (Deep Institutional Mechanics)**
- **Canadian Dec 15, 2024 Reform & CMHC Tiers**:
  - Tiered minimum down payment (5% up to $500k, 10% from $500k to $1.5M, 20% floor over $1.5M).
  - CMHC default insurance rates (2.8%, 3.1%, 4.0% + 0.20% 30-year surcharge).
  - Provincial Sales Tax (PST/QST) on CMHC premiums (ON 8%, QC 9.975%, SK 6%).
  - OSFI B-20 Residential Mortgage Stress Test Qualifying Rate (`max(Contract Rate + 2.0%, 5.25%)`).
- **Refinancing Rate-Shock Ladder**: 1-click macroeconomic presets:
  - *Status Quo*: Flat rates across all future renewals.
  - *Historical Soft Landing*: Progressive -1.50% central bank rate cuts.
  - *Inflation Spike*: +2.00% rate hike shock at next renewal.
- **Target Payoff Goal Solver**: 24-iteration binary search solver finding the exact extra monthly payment or lump sum needed to achieve complete debt freedom in $T$ years.
- **Unified Household Debt Portfolio**: Avalanche vs. Snowball multi-debt cascade with mortgage rollover flow.
- **Virtualized Amortization Ledger**: High-performance progressive chunked table with term renewal dividers and CSV export.

---

## ⚡ 2. Strategic Innovations

### **1. AU & UK Mortgage Offset Accounts & Redraw Facilities**
In Australia and the United Kingdom, savvy borrowers link their liquid savings or checking accounts to their mortgage. Daily interest is calculated on:
$$\text{Effective Balance} = \max(0, \text{Principal} - \text{Offset Balance})$$
TrueMortgage Studio v4.0 models both initial offset balances and ongoing monthly deposits, tracking cumulative interest saved without forcing borrowers to sacrifice cash liquidity.

### **2. Zero-Cloud P2P Device Handoff (QR Code Sync)**
Preserves the 100% Client-Side Zero-Trust Privacy philosophy while solving cross-device continuity. To transfer a scenario from Mac/PC to iPhone/Android:
1. Click **Handoff** in the header.
2. The engine compresses and serializes the complete state tree into a URL hash payload.
3. Scanning the on-screen QR code with your mobile camera opens the exact scenario immediately on mobile—with zero cloud servers, user accounts, or network leaks.

### **3. Local Rule-Based "AI Financial Copilot"**
An algorithmic advisor running entirely in the client's browser that detects high-leverage opportunities:
- *Accelerated Bi-Weekly Advantage*: Quantifies exact years and thousands saved by dividing monthly payment by 2 every 14 days (13 extra payments/yr).
- *Negative Amortization Warning*: Intercepts situations where minimum payments fail to cover interest, stopping infinite runaway debt.
- *80% LTV PMI Eradication Horizon*: Tracks distance to statutory private mortgage insurance cancellation.
- *Household Balance Sheet Mismatch*: Flags prepaying low-APR mortgages while carrying high-APR revolving cards.

---

## 💻 3. Cross-Platform Ergonomics

### **Desktop (1200px+) — 3-Pane Command Studio**
- **Left Pane (`[` to toggle)**: Loan specs, offset accounts, and parameters.
- **Center Canvas**: Fluid progressive disclosure story (Pulse &rarr; Lab &rarr; Engine).
- **Right Pane (`]` to toggle)**: AI Copilot insights and Milestone Highway.
- **Command Palette (`Cmd/Ctrl + K`)**: Instant keyboard navigation to any parameter, stage, macro preset, or export tool.

### **Mobile (<768px) — Thumb-First Ergonomics**
- Minimal top bar and kinetic savings hero readout.
- Sticky bottom action dock (`[⚡ Pulse] [🧪 Lab] [⚙️ Engine] [📊 Ledger]`).
- Bottom-sheet quick-tune drawers for tactile slider adjustment directly under the thumb.

---

## 🚀 4. Development & Testing

### **Prerequisites**
- Node.js &ge; 20.0.0
- npm &ge; 10.0.0

### **Installation**
```bash
npm install
```

### **Run Development Server**
```bash
npm run dev
```

### **Run Comprehensive Test Suite**
```bash
npm test
```

### **Build Production Bundle**
```bash
npm run build
```
*Production bundle size:* **~102 KB (32 KB gzipped)** — a 97.5% reduction from v3.1.0!

---

## 🛡️ License & Privacy
TrueMortgage Studio v4.0 is engineered with a strict **Zero-Trust, 100% Client-Side Architecture**. No financial data is ever collected, tracked, or transmitted across the network.
