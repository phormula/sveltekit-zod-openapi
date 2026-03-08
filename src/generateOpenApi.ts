import fs from "fs";
import path from "path";
import type {
  HttpMethod,
  OpenApiSpec,
  OpenApiOperation,
  ZodSchemaInfo,
  GenerateDocsOptions
} from "./types.js";
import { buildOperationFromInfo } from "./schemaGenerator.js";
import {
  extractHandlerCode,
  extractReturnExamples,
  detectZodSchemas,
  extractZodRequestSchema,
  extractZodResponseSchemas,
  resolveResponseSchemaRefs,
  initResolver
} from "./codeParser.js";
import { extractNearestJsDoc, interpretJsDoc } from "./jsdocParser.js";
import { toOpenApiRoutePath, isApiHandler } from "./pathUtils.js";
import { getDefaultSecuritySchemes } from "./authUtils.js";

/** Module-level options — set by generateDocs() for the current run */
let _options: GenerateDocsOptions | undefined;

export async function generateOpenApiSpec(
  dir: string,
  options?: GenerateDocsOptions
): Promise<OpenApiSpec> {
  const openApiSpec: OpenApiSpec = {
    openapi: "3.0.0",
    info: {
      title: options?.title || "API Documentation",
      version: options?.version || "1.0.0",
      ...(options?.description ? { description: options.description } : {})
    },
    paths: {},
    components: {
      securitySchemes: options?.securitySchemes || getDefaultSecuritySchemes()
    },
    security: []
  };

  await scanDirectory(dir, openApiSpec.paths);
  return openApiSpec;
}

async function scanDirectory(dir: string, paths: Record<string, Record<string, OpenApiOperation>>) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(filePath, paths);
      continue;
    }

    if (!isApiHandler(entry.name)) continue;

    const routePath = toOpenApiRoutePath(filePath);
    const methodsObject = await parseFileForHandlers(filePath, routePath);
    if (Object.keys(methodsObject).length === 0) continue;

    paths[routePath] = {
      ...(paths[routePath] || {}),
      ...methodsObject
    };
  }
}

/**
 * Merge auto-detected response schemas with @responseSchema JSDoc refs.
 * When @responseSchema refs exist, they REPLACE auto-detected response schemas
 * entirely (since the user is explicitly declaring what responses to use).
 */
function mergeResponseSchemas(
  autoDetected: ZodSchemaInfo[],
  jsdocRefs: ZodSchemaInfo[]
): ZodSchemaInfo[] {
  if (jsdocRefs.length > 0) {
    return jsdocRefs;
  }
  return autoDetected;
}

async function parseFileForHandlers(
  filePath: string,
  routePath?: string
): Promise<Record<string, OpenApiOperation>> {
  const fileContent = fs.readFileSync(filePath, "utf8");

  const methodRegex =
    /export\s+(?:const\s+|async\s+function\s+|function\s+)(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;

  const methods: Record<string, OpenApiOperation> = {};
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(fileContent)) !== null) {
    const httpMethod = match[1] as HttpMethod;

    const jsdoc = extractNearestJsDoc(fileContent, match.index);

    // Skip handlers marked with @hidden or @ignore
    if (/@(hidden|ignore)\b/.test(jsdoc)) continue;

    const info = interpretJsDoc(jsdoc);

    // Extract actual return examples from the handler code
    const handlerCode = extractHandlerCode(fileContent, match.index, httpMethod);
    const extractedExamples = extractReturnExamples(handlerCode, httpMethod);

    // Detect Zod schemas in the handler
    const zodSchemas = await detectZodSchemas(fileContent);
    const zodRequestSchema = extractZodRequestSchema(zodSchemas);
    let zodResponseSchemas = extractZodResponseSchemas(zodSchemas);

    // Resolve @responseSchema JSDoc references
    if (info.responseSchemas && info.responseSchemas.length > 0) {
      const resolvedResponseSchemas = await resolveResponseSchemaRefs(
        info.responseSchemas,
        fileContent,
        zodSchemas
      );
      zodResponseSchemas = mergeResponseSchemas(zodResponseSchemas, resolvedResponseSchemas);
    }

    console.log(`\n=== ${httpMethod} ${routePath} ===`);
    if (info.responseSchemas && info.responseSchemas.length > 0) {
      console.log(
        `  @responseSchema refs: ${info.responseSchemas.map((r) => `${r.schemaName} (${r.statusCode})`).join(", ")}`
      );
    }

    // Merge JSDoc examples with extracted examples
    const mergedInfo = {
      ...info,
      examples: { ...extractedExamples, ...info.examples }
    };

    const lower = httpMethod.toLowerCase();
    methods[lower] = buildOperationFromInfo(
      httpMethod,
      mergedInfo,
      routePath,
      zodRequestSchema || undefined,
      zodResponseSchemas,
      _options
    );
  }

  return methods;
}

// ---- public API

/**
 * Generate OpenAPI documentation from SvelteKit API routes.
 *
 * @param options - Configuration for routes directory, output path, API info, etc.
 *
 * @example
 * ```ts
 * import { generateDocs } from 'sveltekit-openapi-docs';
 *
 * await generateDocs({
 *   routesDir: 'src/routes/(api)',
 *   outputPath: 'static/openapi/swagger.json',
 *   title: 'My API',
 *   version: '1.0.0',
 * });
 * ```
 */
export async function generateDocs(options: GenerateDocsOptions) {
  _options = options;

  // Initialise alias/path resolver
  const projectRoot = process.cwd();
  const aliases = options.aliases || { $lib: "src/lib" };
  initResolver(projectRoot, aliases);

  const openApiSpec = await generateOpenApiSpec(options.routesDir, options);

  const outDir = path.dirname(options.outputPath);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(options.outputPath, JSON.stringify(openApiSpec, null, 2));
  console.log(`\nOpenAPI specification generated at ${options.outputPath}`);
}
