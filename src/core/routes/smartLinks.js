import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// ── User app (existing) ──────────────────────────────────────────────────
const ANDROID_PACKAGE_NAME =
  process.env.ANDROID_PACKAGE_NAME || "com.gloup.userapp";
const IOS_APP_STORE_ID = process.env.IOS_APP_STORE_ID || "6752922662";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
const APP_STORE_URL = IOS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
  : null;

// ── Partner app ──────────────────────────────────────────────────────────
const PARTNER_ANDROID_PACKAGE_NAME =
  process.env.PARTNER_ANDROID_PACKAGE_NAME || "com.gloup.partnerapp";
/** App Store Connect Apple ID for GloUp Partner. */
const PARTNER_IOS_APP_STORE_ID =
  process.env.PARTNER_IOS_APP_STORE_ID || "6732799057";
const PARTNER_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PARTNER_ANDROID_PACKAGE_NAME}`;
const PARTNER_APP_STORE_URL = PARTNER_IOS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${PARTNER_IOS_APP_STORE_ID}`
  : null;
/** Comma-separated SHA-256 fingerprints (Play App Signing + upload key). */
const DEFAULT_PARTNER_ANDROID_SHA256 =
  "DF:56:1D:83:CB:D3:12:93:3C:6D:82:53:A1:B6:CE:67:66:55:7F:10:CC:58:61:7A:F1:4D:FE:E0:EE:62:51:40";
const PARTNER_ANDROID_SHA256 = (
  process.env.PARTNER_ANDROID_SHA256 || DEFAULT_PARTNER_ANDROID_SHA256
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const APP_NAME = process.env.APP_NAME || "Gloup";
const PARTNER_APP_NAME =
  process.env.PARTNER_APP_NAME || `${APP_NAME} Partner`;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "HP59PZAVRP";

const wellKnownDir = path.join(path.resolve(), "public", "well-known");

/**
 * Serve a static verification file as raw JSON.
 * App platforms fetch these unauthenticated, so no auth middleware runs here.
 */
function serveJsonFile(res, filePath) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(data);
  });
}

function sendJson(res, payload) {
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).send(JSON.stringify(payload));
}

/** Merge static assetlinks with partner entry when SHA-256 env is set. */
function buildAssetLinks() {
  let base = [];
  try {
    const raw = fs.readFileSync(
      path.join(wellKnownDir, "assetlinks.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    base = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    base = [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: [],
        },
      },
    ];
  }

  const withoutPartner = base.filter(
    (entry) =>
      entry?.target?.package_name !== PARTNER_ANDROID_PACKAGE_NAME
  );

  if (PARTNER_ANDROID_SHA256.length > 0) {
    withoutPartner.push({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PARTNER_ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: PARTNER_ANDROID_SHA256,
      },
    });
  }

  return withoutPartner;
}

/** AASA covering user `/download` and partner `/download/partner`. */
function buildAppleAppSiteAssociation() {
  let base = {
    applinks: { apps: [], details: [] },
  };
  try {
    const raw = fs.readFileSync(
      path.join(wellKnownDir, "apple-app-site-association"),
      "utf8"
    );
    base = JSON.parse(raw);
  } catch {
    /* use defaults below */
  }

  const details = Array.isArray(base?.applinks?.details)
    ? [...base.applinks.details]
    : [];

  const userAppId = `${APPLE_TEAM_ID}.${ANDROID_PACKAGE_NAME}`;
  const partnerAppId = `${APPLE_TEAM_ID}.${PARTNER_ANDROID_PACKAGE_NAME}`;

  const withoutPartner = details.filter((d) => d?.appID !== partnerAppId);

  // Ensure user paths stay scoped to /download (not /download/partner)
  const userIdx = withoutPartner.findIndex((d) => d?.appID === userAppId);
  if (userIdx >= 0) {
    withoutPartner[userIdx] = {
      ...withoutPartner[userIdx],
      paths: ["/download", "/download/", "/open", "/open/*"],
    };
  } else {
    withoutPartner.push({
      appID: userAppId,
      paths: ["/download", "/download/", "/open", "/open/*"],
    });
  }

  withoutPartner.push({
    appID: partnerAppId,
    paths: ["/download/partner", "/download/partner/*"],
  });

  return {
    applinks: {
      apps: [],
      details: withoutPartner,
    },
  };
}

// Android App Links verification (user + optional partner)
router.get("/.well-known/assetlinks.json", (req, res) => {
  try {
    sendJson(res, buildAssetLinks());
  } catch (err) {
    console.error("[smartLinks] assetlinks error:", err?.message || err);
    serveJsonFile(res, path.join(wellKnownDir, "assetlinks.json"));
  }
});

// iOS Universal Links verification
router.get("/.well-known/apple-app-site-association", (req, res) => {
  try {
    sendJson(res, buildAppleAppSiteAssociation());
  } catch (err) {
    console.error("[smartLinks] aasa error:", err?.message || err);
    serveJsonFile(res, path.join(wellKnownDir, "apple-app-site-association"));
  }
});

router.get("/apple-app-site-association", (req, res) => {
  try {
    sendJson(res, buildAppleAppSiteAssociation());
  } catch (err) {
    serveJsonFile(res, path.join(wellKnownDir, "apple-app-site-association"));
  }
});

/** Best-effort device detection from the User-Agent string. */
function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

function renderOrRedirectDownload(req, res, { appName, playStoreUrl, appStoreUrl }) {
  const deviceType = detectDevice(req.get("user-agent"));

  if (deviceType === "android") {
    return res.redirect(302, playStoreUrl);
  }
  if (deviceType === "ios" && appStoreUrl) {
    return res.redirect(302, appStoreUrl);
  }

  return res.render("download", {
    appName,
    deviceType,
    playStoreUrl,
    appStoreUrl,
  });
}

/**
 * Partner smart-link: https://api.v1.gloup.in/download/partner
 * Same behavior as user download, but for GloUp Partner.
 * Registered before `/download` so path matching stays explicit.
 */
router.get("/download/partner", (req, res) => {
  return renderOrRedirectDownload(req, res, {
    appName: PARTNER_APP_NAME,
    playStoreUrl: PARTNER_PLAY_STORE_URL,
    appStoreUrl: PARTNER_APP_STORE_URL,
  });
});

/**
 * User smart-link: https://api.v1.gloup.in/download
 * Opens user app when installed + verified; otherwise store / fallback page.
 */
router.get("/download", (req, res) => {
  return renderOrRedirectDownload(req, res, {
    appName: APP_NAME,
    playStoreUrl: PLAY_STORE_URL,
    appStoreUrl: APP_STORE_URL,
  });
});

export const smartLinkRouter = router;
