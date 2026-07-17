import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// Store identifiers (overridable via env; defaults confirmed for the Gloup user app)
const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || "com.gloup.userapp";
const IOS_APP_STORE_ID = process.env.IOS_APP_STORE_ID || "6752922662";

const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
const APP_STORE_URL = IOS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
  : null;

const APP_NAME = process.env.APP_NAME || "Gloup";

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

// Android App Links verification
router.get("/.well-known/assetlinks.json", (req, res) => {
  serveJsonFile(res, path.join(wellKnownDir, "assetlinks.json"));
});

// iOS Universal Links verification (no extension, must be application/json, no redirects)
router.get("/.well-known/apple-app-site-association", (req, res) => {
  serveJsonFile(res, path.join(wellKnownDir, "apple-app-site-association"));
});

// Some setups also probe the /apple-app-site-association at the domain root.
router.get("/apple-app-site-association", (req, res) => {
  serveJsonFile(res, path.join(wellKnownDir, "apple-app-site-association"));
});

/** Best-effort device detection from the User-Agent string. */
function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  // iPadOS 13+ reports as Macintosh, but includes touch support; UA sniffing can't catch that reliably.
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

/**
 * Smart-link fallback. Universal/App Links open the native app directly when
 * installed + verified; otherwise the browser lands here and we route to the
 * right store (or show both on desktop).
 */
router.get("/download", (req, res) => {
  const deviceType = detectDevice(req.get("user-agent"));

  if (deviceType === "android") {
    return res.redirect(302, PLAY_STORE_URL);
  }
  if (deviceType === "ios" && APP_STORE_URL) {
    return res.redirect(302, APP_STORE_URL);
  }

  return res.render("download", {
    appName: APP_NAME,
    deviceType,
    playStoreUrl: PLAY_STORE_URL,
    appStoreUrl: APP_STORE_URL,
  });
});

export const smartLinkRouter = router;
