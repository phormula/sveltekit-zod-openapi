import type { HttpMethod, JsDocInfo, OpenApiSecurityScheme, GenerateDocsOptions } from "./types.js";

/**
 * Determine if authentication is required for an endpoint.
 * Uses custom authResolver if provided, then falls back to defaults.
 */
export function determineAuthRequirement(
  httpMethod: HttpMethod,
  routePath?: string,
  info?: JsDocInfo,
  authResolver?: GenerateDocsOptions["authResolver"]
): boolean {
  // Check JSDoc annotation first
  if (info?.requiresAuth !== undefined) {
    return info.requiresAuth;
  }

  // Check custom auth resolver
  if (authResolver) {
    const result = authResolver(httpMethod, routePath, info);
    if (result !== undefined) return result;
  }

  // Default: POST/PUT/PATCH/DELETE require auth
  if (
    httpMethod === "POST" ||
    httpMethod === "PUT" ||
    httpMethod === "PATCH" ||
    httpMethod === "DELETE"
  ) {
    return true;
  }

  return false;
}

/**
 * Get security requirements based on route path.
 * Returns all defined security schemes as alternatives.
 */
export function getSecurityRequirements(
  securitySchemes?: Record<string, OpenApiSecurityScheme>
): Array<Record<string, string[]>> {
  if (!securitySchemes) return getDefaultSecurityRequirements();
  return Object.keys(securitySchemes).map((name) => ({ [name]: [] }));
}

/**
 * Default security requirements (API key or Bearer token)
 */
function getDefaultSecurityRequirements(): Array<Record<string, string[]>> {
  return [{ apiKey: [] }, { bearerAuth: [] }];
}

/**
 * Get the default security schemes for OpenAPI spec
 */
export function getDefaultSecuritySchemes(): Record<string, OpenApiSecurityScheme> {
  return {
    apiKey: {
      type: "apiKey" as const,
      name: "X-API-Key",
      in: "header" as const,
      description: "API key authentication"
    },
    bearerAuth: {
      type: "http" as const,
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Bearer token authentication"
    }
  };
}
