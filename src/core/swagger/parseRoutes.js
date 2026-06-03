import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

/** @type {{ file: string; base: string; tag: string }[]} */
const ROUTE_SOURCES = [
  {
    file: "src/User/routes/userauthroutes.js",
    base: "/user/auth",
    tag: "User · Auth",
  },
  {
    file: "src/User/routes/userapproutes.js",
    base: "/user/app",
    tag: "User · App",
  },
  {
    file: "src/Partner/routes/partnerauthroutes.js",
    base: "/partner/auth",
    tag: "Partner · Auth",
  },
  {
    file: "src/Partner/routes/partnerapproutes.js",
    base: "/partner/app",
    tag: "Partner · App",
  },
  {
    file: "src/Admin/routes/authroutes.js",
    base: "/admin/auth",
    tag: "Admin · Auth",
  },
  {
    file: "src/Admin/routes/approutes.js",
    base: "/admin/app",
    tag: "Admin · App",
  },
];

const ROUTE_CALL_RE =
  /\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;

const AUTH_MIDDLEWARE = [
  { pattern: /UserAuthenticate/, security: "userauth" },
  { pattern: /OptionalUserAuthenticate/, security: "userauthOptional" },
  { pattern: /WebAuthenticate/, security: "userauth" },
  { pattern: /verifyadmin/, security: "adminauth" },
  { pattern: /partnerauthenticate/, security: "partnertoken" },
];

const MULTIPART_HINT =
  /S3upload|upload\.|upload\.fields|upload\.single|upload\.array/;

/**
 * @param {string} filePath
 * @param {string} base
 * @param {string} tag
 */
function parseRouteFile(filePath, base, tag) {
  const absolute = path.join(projectRoot, filePath);
  if (!fs.existsSync(absolute)) {
    return [];
  }

  const content = fs.readFileSync(absolute, "utf8");
  const routes = [];
  let match;

  while ((match = ROUTE_CALL_RE.exec(content)) !== null) {
    const method = match[1].toLowerCase();
    const routePath = match[2];
    const start = match.index;
    const end = content.indexOf(");", start);
    const block =
      end === -1 ? content.slice(start) : content.slice(start, end + 2);

    let security = null;
    for (const { pattern, security: sec } of AUTH_MIDDLEWARE) {
      if (pattern.test(block)) {
        security = sec;
        break;
      }
    }

    const fullPath = `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;

    routes.push({
      method,
      path: fullPath,
      tag,
      security,
      multipart: MULTIPART_HINT.test(block),
    });
  }

  return routes;
}

/** Static utility routes not defined in route modules */
function getStaticRoutes() {
  return [
    {
      method: "get",
      path: "/status",
      tag: "System",
      security: null,
      multipart: false,
    },
    {
      method: "get",
      path: "/",
      tag: "System",
      security: null,
      multipart: false,
    },
    {
      method: "post",
      path: "/api/upload",
      tag: "System · S3",
      security: null,
      multipart: true,
    },
  ];
}

export function collectAllRoutes() {
  const routes = [...getStaticRoutes()];

  for (const source of ROUTE_SOURCES) {
    routes.push(...parseRouteFile(source.file, source.base, source.tag));
  }

  return routes;
}
