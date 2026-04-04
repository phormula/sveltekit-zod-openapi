export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type ResponseSchemaRef = {
  schemaName: string;
  statusCode: string;
  importPath?: string;
};

export type JsDocInfo = {
  summary?: string;
  description?: string;
  tags?: string[];
  examples?: Record<string /* status */, unknown>;
  responses?: Record<string /* status */, string /* description */>;
  requiresAuth?: boolean;
  responseSchemas?: ResponseSchemaRef[];
};

export type OpenApiSchema = {
  type: string;
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
  required?: string[];
  items?: OpenApiSchema;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
};

export type OpenApiResponse = {
  description: string;
  content: {
    "application/json": {
      schema: OpenApiSchema;
      example: unknown;
    };
  };
};

export type OpenApiOperation = {
  summary: string;
  description?: string;
  tags?: string[];
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: OpenApiSchema;
        example: unknown;
      };
    };
  };
};

export type OpenApiSecurityScheme = {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  bearerFormat?: string;
  description?: string;
};

export type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
};

export type ZodSchemaInfo = {
  schemaName: string;
  importPath: string;
  usage: string;
  type: "request" | "response";
  schema?: import("zod").ZodTypeAny;
  statusCode?: string;
};

/**
 * Configuration options for the OpenAPI documentation generator.
 */
export type GenerateDocsOptions = {
  /** Directory containing SvelteKit API routes (e.g., "src/routes/(api)") */
  routesDir: string;
  /** Output file path for the generated OpenAPI spec (e.g., "static/openapi/swagger.json") */
  outputPath: string;
  /** API title shown in the OpenAPI spec */
  title?: string;
  /** API version shown in the OpenAPI spec */
  version?: string;
  /** API description shown in the OpenAPI spec */
  description?: string;
  /** Custom security schemes. Defaults to apiKey + bearerAuth. */
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
  /**
   * Custom function to determine if an endpoint requires authentication.
   * Receives the HTTP method, route path, and parsed JSDoc info.
   * Return `true` to require auth, `false` to skip, or `undefined` to fall through to defaults.
   */
  authResolver?: (method: HttpMethod, routePath?: string, info?: JsDocInfo) => boolean | undefined;
  /**
   * Alias map for resolving import paths (e.g., { "$lib": "src/lib" }).
   * Defaults to `{ "$lib": "src/lib" }`.
   */
  aliases?: Record<string, string>;
};
