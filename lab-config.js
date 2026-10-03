// Phase 1 configuration for the SeaWorld Lab Sheet intake proof of concept.
//
// SECURITY:
// - Never place a Supabase service-role key here.
// - Never place reusable technician/admin secrets here.
// - Browser code should call a secure API/Edge Function.
// - The future iPad device token should be supplied to the Shortcut, not committed here.

window.LAB_SHEETS_CONFIG = Object.freeze({
  siteId: "seaworld",
  siteLabel: "SeaWorld Orlando",

  // Keep true until a real backend is connected.
  demoMode: true,

  // Future backend endpoints. Examples:
  // apiBaseUrl: "https://<project-ref>.supabase.co/functions/v1"
  // listEndpoint: "/lab-sheet-list"
  // uploadEndpoint: "/lab-sheet-upload"
  // imageEndpoint: "/lab-sheet-image"
  apiBaseUrl: "",
  listEndpoint: "/lab-sheet-list",
  uploadEndpoint: "/lab-sheet-upload",
  imageEndpoint: "/lab-sheet-image",

  // How often the technician history screen should refresh when live.
  refreshIntervalMs: 60000,

  // POC display defaults only.
  defaultDeviceLabel: "Water Quality iPad",
  expectedRoundHours: [6, 10, 14, 18, 22, 2]
});

