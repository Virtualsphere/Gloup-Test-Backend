#!/usr/bin/env node
/**
 * Export OpenAPI spec to openapi.json (e.g. for CI or Postman import).
 * Usage: node scripts/export-openapi.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildOpenApiSpec } from "../src/core/swagger/buildOpenApiSpec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "openapi.json");

const spec = buildOpenApiSpec();
fs.writeFileSync(outPath, JSON.stringify(spec, null, 2), "utf8");
console.log(`Wrote ${outPath} (${Object.keys(spec.paths).length} paths)`);
