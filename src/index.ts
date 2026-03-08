// Public API
export { generateDocs, generateOpenApiSpec } from "./generateOpenApi.js";

// Vite plugin
export { sveltekitOpenApi } from "./vitePlugin.js";
export type { SvelteKitOpenApiPluginOptions } from "./vitePlugin.js";

// Types
export type {
  GenerateDocsOptions,
  HttpMethod,
  JsDocInfo,
  ZodSchemaInfo,
  ResponseSchemaRef,
  OpenApiSpec,
  OpenApiOperation,
  OpenApiResponse,
  OpenApiSchema,
  OpenApiSecurityScheme
} from "./types.js";
