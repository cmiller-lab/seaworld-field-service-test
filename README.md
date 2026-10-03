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
