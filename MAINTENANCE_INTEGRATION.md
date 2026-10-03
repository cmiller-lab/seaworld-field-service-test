# Combined water chemistry console

The beta dashboard now includes Calibration Log and Feeder Cleaning launchers. Both open a styled maintenance workspace inside the existing console layout. The original calibration code is isolated in a same-origin iframe to avoid collisions with calculator globals and element IDs.

All original spot-check, history, ORP, feeder cleaning, report sharing, and sync workflows remain connected to the existing Supabase project and tables. No database migration is needed. The original pool-calibration-log deployment is unchanged.

Cloud-synced records remain shared. Browser-only pending records belong to the old app's origin and must finish syncing there before switching; the new interface cannot read another origin's localStorage or IndexedDB.

The console service worker caches the maintenance module for offline spot checks. Shared feeder updates still require a connection, as in the original app.
