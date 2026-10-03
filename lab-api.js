(() => {
  "use strict";

  const config = window.LAB_SHEETS_CONFIG || {};

  function endpoint(path) {
    if (!config.apiBaseUrl) return "";
    return `${config.apiBaseUrl.replace(/\/+$/, "")}${path}`;
  }

  async function parseJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Server returned an invalid response (${response.status}).`);
    }
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store"
      });

      const body = await parseJson(response);
      if (!response.ok) {
        throw new Error(body.error || body.message || `Request failed (${response.status}).`);
      }
      return body;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("The request timed out. Check the network connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function listSubmissions() {
    if (config.demoMode || !config.apiBaseUrl) {
      return { demo: true, submissions: demoSubmissions() };
    }

    const url = new URL(endpoint(config.listEndpoint), window.location.href);
    url.searchParams.set("site", config.siteId || "seaworld");
    return request(url.toString(), { method: "GET" });
  }

  async function uploadSubmission({ file, deviceLabel }) {
    if (!file) throw new Error("Choose or take a photo first.");

    if (config.demoMode || !config.apiBaseUrl) {
      throw new Error("Upload backend is not connected yet. Phase 1 is running in demo mode.");
    }

    const form = new FormData();
    form.append("photo", file, file.name || "lab-sheet.jpg");
    form.append("site", config.siteId || "seaworld");
    form.append("device", deviceLabel || config.defaultDeviceLabel || "Water Quality iPad");

    // Authentication is intentionally NOT defined here.
    // The production iPad Shortcut will send its device token directly to the
    // secure upload Edge Function. Do not hard-code that token in this file.
    return request(endpoint(config.uploadEndpoint), {
      method: "POST",
      body: form
    });
  }

  function getImageUrl(submission) {
    if (!submission) return "";

    // In demo mode, submissions use data URLs/placeholders only.
    if (submission.imageUrl) return submission.imageUrl;

    // A live backend should return a short-lived signed URL with each record,
    // or expose a secure endpoint that returns one.
    if (!config.demoMode && config.apiBaseUrl && submission.id) {
      const url = new URL(endpoint(config.imageEndpoint), window.location.href);
      url.searchParams.set("id", submission.id);
      return url.toString();
    }

    return "";
  }

  function demoSubmissions() {
    const now = Date.now();
    return [
      {
        id: "demo-001",
        submittedAt: new Date(now - 38 * 60 * 1000).toISOString(),
        site: config.siteLabel || "SeaWorld Orlando",
        device: "Water Quality iPad",
        status: "ready",
        roundLabel: "10:00 AM Round",
        originalName: "lab-sheet-demo.jpg",
        notes: "Demo record — no backend data",
        imageUrl: ""
      },
      {
        id: "demo-002",
        submittedAt: new Date(now - 4 * 60 * 60 * 1000 - 16 * 60 * 1000).toISOString(),
        site: config.siteLabel || "SeaWorld Orlando",
        device: "Water Quality iPad",
        status: "processing",
        roundLabel: "6:00 AM Round",
        originalName: "lab-sheet-demo.jpg",
        notes: "Demo record — no backend data",
        imageUrl: ""
      },
      {
        id: "demo-003",
        submittedAt: new Date(now - 8 * 60 * 60 * 1000 - 5 * 60 * 1000).toISOString(),
        site: config.siteLabel || "SeaWorld Orlando",
        device: "Water Quality iPad",
        status: "review",
        roundLabel: "2:00 AM Round",
        originalName: "lab-sheet-demo.jpg",
        notes: "Demo record — no backend data",
        imageUrl: ""
      }
    ];
  }

  window.LabSheetsAPI = Object.freeze({
    listSubmissions,
    uploadSubmission,
    getImageUrl
  });
})();

