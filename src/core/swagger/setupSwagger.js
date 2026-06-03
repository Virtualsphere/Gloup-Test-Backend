import { buildOpenApiSpec } from "./buildOpenApiSpec.js";
import { collectAllRoutes } from "./parseRoutes.js";

let cachedSpec = null;

export function getOpenApiSpec(forceRefresh = false) {
  if (!cachedSpec || forceRefresh) {
    cachedSpec = buildOpenApiSpec();
  }
  return cachedSpec;
}

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gloup API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/api-docs/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
      });
    };
  </script>
</body>
</html>`;

/**
 * Mount Swagger UI (CDN) and raw OpenAPI JSON on the Express app.
 * @param {import('express').Express} app
 */
export function setupSwagger(app) {
  const routeCount = collectAllRoutes().length;

  app.get("/api-docs/openapi.json", (req, res) => {
    res.json(getOpenApiSpec());
  });

  app.get("/api-docs", (req, res) => {
    res.type("html").send(SWAGGER_UI_HTML);
  });

  const hostPort = process.env.HOST_PORT || process.env.APP_PORT || "5678";
  console.log(
    `📚 Swagger UI: http://localhost:${hostPort}/api-docs (${routeCount} operations)`
  );
}
