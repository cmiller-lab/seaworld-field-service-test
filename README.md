# SeaWorld Field Service

Independent interface in seaworld-field-service-test. The original apps are unchanged.

## Shared logging
Calibration spot checks and feeder cleaning use the original Supabase project and tables: spot_checks and feeder_cleanings. New entries and deletions affect the shared data used by the original app. No database migration is required.

Spot checks save to a dedicated IndexedDB database first and sync when online. The header reports pending/offline/failed sync states. Feeder updates require a connection and show success only after the server confirms the row. Technician attribution is required for feed-down, levels and cleaning.

The former local test database and mirror are intentionally separate from live logging. Test samples are never migrated into the shared tables.

Lab sheets retain the existing demo configuration because the source repository has no live lab-sheet endpoints configured. Incident reports remain the existing PDF workflow.

## Navigation
Four home tasks, persistent bottom navigation, searchable pool context shared across calculators and calibration, recent pools, larger feeder controls, collapsible formulas and reference tables.

## Validation
Syntax and DOM tests exercise navigation, selection, measurement validation, feeder write acknowledgements and offline handling with mocked requests. Production verification uses read-only queries; no fabricated production records are created.

## Feeder cleaning workflow
The feeder screen now uses append-only `feeder_activity` events in the same Supabase project. The 65-feeder inventory has monthly completion, last-cleaned dates across months, property and selected-pool filters, Remaining / Feeding Down / Ready / Completed queues, daily activity reports and cleaning history. Pending feed-down carries into the next month; cleaning counts in its actual calendar month (America/New_York). Starting another feed-down preserves completed history. Corrections require a reason and retain the original event. Technician identity is visible and required. Saving requires connectivity; retry request IDs prevent duplicate events.

The monthly `feeder_cleanings` snapshots remain compatible with the original app. A database trigger captures future changes made by that app. Existing surviving snapshot timestamps were imported and labelled; overwritten earlier actions cannot be recovered. `database/feeder-activity.sql` documents the one-time additive migration already applied to the shared project; do not rerun it against that project.

Validation: mocked DOM checks cover queues, 65-feeder inventory, pool context, cross-month dates, repeated feed-down, corrections, attribution and daily activity. Transactional database tests cover anon-role RPC saves, carryover, request deduplication and immutable history, then roll back all verification records.
