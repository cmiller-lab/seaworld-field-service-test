# SeaWorld Field Service — UI test

Separate testing copy of calc-and-report-beta with task-based navigation. Open index.html through a local HTTP server or deploy via GitHub Pages (main / root).

## Included
- Four home tasks and persistent bottom navigation
- Searchable property/pool selector, remembered selection and three recent pools
- Pool selection shared across six chemistry calculators and calibration workspace
- Existing calculators, pump tools, reports, ORP and feeder workflows
- Larger feeder controls and collapsed formulas/reference tables
- Distinct TEST PWA identity and local test data

## Data isolation
Calibration and feeder requests are intercepted by test-data.js and saved to this origin's browser storage. No Supabase request reaches the shared production database. Records and test history persist only on this device; they are not synchronized between technicians. Lab sheets remain in their existing demo mode. Do not use this test copy to record actual service work.

## Test
Check desktop and iPhone widths, all four tabs, pool search, pool changes across calculators, calibration saves/history, feeder feed-down/levels/cleaned/history, offline reload, and installed PWA behavior.

## Publish
Create cmiller-lab/seaworld-field-service-test, upload all root files, then Settings → Pages → Deploy from a branch → main / root.
