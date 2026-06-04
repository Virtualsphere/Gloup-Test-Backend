import { collectAllRoutes } from "./parseRoutes.js";
import { OPENAPI_SCHEMAS, MULTIPART_SCHEMAS } from "./schemas.js";
import {
  resolveBodySchemaName,
  resolveQueryParameters,
} from "./resolveRequestBody.js";

const SECURITY_SCHEMES = {
  userauth: {
    type: "apiKey",
    in: "header",
    name: "userauth",
    description: "Encrypted session token for customer app (after OTP verify).",
  },
  userauthOptional: {
    type: "apiKey",
    in: "header",
    name: "userauth",
    description: "Optional — enhances response when logged in.",
  },
  adminauth: {
    type: "apiKey",
    in: "header",
    name: "adminauth",
    description: "Admin panel session token (after /admin/auth/login).",
  },
  partnertoken: {
    type: "apiKey",
    in: "header",
    name: "partnertoken",
    description: "Partner/salon app session token (after OTP verify).",
  },
};

function pathToOpenApi(path) {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function summaryFromRoute(route) {
  const segment = route.path.split("/").filter(Boolean).pop() || "root";
  const name = segment.replace(/[{}]/g, "").replace(/-/g, " ");
  return `${route.method.toUpperCase()} ${name}`;
}

/**
 * @param {string} schemaName
 * @param {{ required?: boolean, multipart?: boolean }} opts
 */
function buildRequestBody(schemaName, opts = {}) {
  const multipartSchema = MULTIPART_SCHEMAS[schemaName];
  const jsonSchema = OPENAPI_SCHEMAS[schemaName];

  if (multipartSchema || opts.multipart) {
    const schema = multipartSchema || jsonSchema;
    return {
      required: opts.required !== false,
      content: {
        "multipart/form-data": {
          schema: schema ? { ...schema } : { type: "object", properties: {} },
        },
      },
    };
  }

  if (!jsonSchema) {
    return {
      required: false,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/AdminPaginationFilterRequest" },
        },
      },
    };
  }

  return {
    required: opts.required !== false && jsonSchema.required?.length > 0,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function securityForRoute(route) {
  if (!route.security) return [];
  if (route.security === "userauthOptional") {
    return [{ userauthOptional: [] }];
  }
  return [{ [route.security]: [] }];
}

/**
 * @param {{ serverUrl?: string }} [options]
 */
export function buildOpenApiSpec(options = {}) {
  const routes = collectAllRoutes();
  const paths = {};

  for (const route of routes) {
    const oaPath = pathToOpenApi(route.path);
    if (!paths[oaPath]) paths[oaPath] = {};

    const bodyRef = resolveBodySchemaName(route);

    const operation = {
      tags: [route.tag],
      summary: summaryFromRoute(route),
      description: [
        bodyRef?.schemaName
          ? `Request schema: \`${bodyRef.schemaName}\`.`
          : null,
        route.multipart ? "Uses **multipart/form-data**." : null,
        route.security
          ? `Auth: \`${route.security === "userauthOptional" ? "userauth (optional)" : route.security}\` header.`
          : "No auth header required.",
      ]
        .filter(Boolean)
        .join(" "),
      security: securityForRoute(route),
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "integer", example: 200 },
                  success: { type: "boolean", example: true },
                  data: { type: "object" },
                },
              },
            },
          },
        },
        400: { description: "Bad request / validation error" },
        401: { description: "Unauthorized / invalid token" },
        404: { description: "Not found" },
        429: { description: "Rate limit exceeded (auth OTP routes)" },
        500: { description: "Server error" },
      },
    };

    if (
      route.method !== "get" &&
      bodyRef &&
      bodyRef.schemaName !== "EmptyBody"
    ) {
      operation.requestBody = buildRequestBody(bodyRef.schemaName, {
        required: bodyRef.required,
        multipart: bodyRef.multipart || route.multipart,
      });
    }

    const parameters = resolveQueryParameters(route);
    if (parameters?.length) {
      operation.parameters = parameters;
    }

    paths[oaPath][route.method] = operation;
  }

  const port = process.env.APP_PORT || "5678";
  const serverUrl =
    options.serverUrl ||
    process.env.SWAGGER_SERVER_URL ||
    `http://localhost:${port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: `${process.env.APP_NAME || "Gloup"} API`,
      version: "1.0.0",
      description: [
        "API documentation generated from Express route files.",
        "",
        "Request bodies use **named schemas** with example fields (not generic placeholders).",
        "",
        "**Auth headers:** `userauth` (customer), `partnertoken` (salon), `adminauth` (admin).",
      ].join("\n"),
      contact: { name: "Gloup API" },
    },
    servers: [
      { url: serverUrl, description: "Current environment" },
      { url: "http://localhost:5678", description: "Local default" },
      { url: "https://api.v1.gloup.in", description: "Production" },
    ],
    tags: [
      { name: "System", description: "Health & utilities" },
      { name: "User · Auth", description: "Customer authentication" },
      { name: "User · App", description: "Customer app APIs" },
      { name: "Partner · Auth", description: "Salon partner authentication" },
      { name: "Partner · App", description: "Salon partner app APIs" },
      { name: "Admin · Auth", description: "Admin panel login" },
      { name: "Admin · App", description: "Admin panel APIs" },
    ],
    components: {
      securitySchemes: SECURITY_SCHEMES,
      schemas: {
        ...OPENAPI_SCHEMAS,
        ...MULTIPART_SCHEMAS,
      },
    },
    paths,
  };
}
