import type { HttpMethod, ZodSchemaInfo, ResponseSchemaRef } from "./types.js";
import path from "path";
import { tsImport } from "tsx/esm/api";

export type { ZodSchemaInfo };

/** Aliases map (e.g. { "$lib": "src/lib" }) — set at init time */
let _aliases: Record<string, string> = { $lib: "src/lib" };
let _projectRoot: string = process.cwd();

/**
 * Initialise path resolution for a specific project.
 * Called by generateDocs before scanning routes.
 */
export function initResolver(projectRoot: string, aliases: Record<string, string>) {
  _projectRoot = projectRoot;
  _aliases = aliases;
}

/**
 * Resolve import path using configured aliases
 */
function resolveImportPath(importPath: string): string {
  for (const [alias, target] of Object.entries(_aliases)) {
    if (importPath.startsWith(alias)) {
      let resolved = path.join(_projectRoot, importPath.replace(alias, target));
      if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) {
        resolved += ".ts";
      }
      return resolved;
    }
  }
  return importPath;
}

/**
 * Dynamically import a module, using tsx's tsImport for .ts files
 * so that TypeScript schemas can be loaded at runtime.
 */
async function dynamicImport(filePath: string): Promise<Record<string, unknown>> {
  if (filePath.endsWith(".ts")) {
    return tsImport(filePath, import.meta.url) as Promise<Record<string, unknown>>;
  }
  return import(filePath);
}

/**
 * Extract the code block for a specific HTTP method handler
 */
export function extractHandlerCode(
  fileContent: string,
  methodIndex: number,
  httpMethod: HttpMethod
): string {
  const methodRegex = new RegExp(
    `export\\s+(?:const\\s+|async\\s+function\\s+|function\\s+)${httpMethod}\\b`
  );
  const methodMatch = fileContent.slice(methodIndex).match(methodRegex);
  if (!methodMatch) return "";

  const handlerStart = methodIndex + methodMatch.index! + methodMatch[0].length;

  let braceCount = 0;
  let inString = false;
  let stringChar = "";
  let handlerEnd = handlerStart;
  let foundStart = false;

  for (let i = handlerStart; i < fileContent.length; i++) {
    const char = fileContent[i];
    const prevChar = i > 0 ? fileContent[i - 1] : "";

    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (inString) continue;

    if (!foundStart && (char === "{" || (char === "=" && fileContent[i + 1] === ">"))) {
      foundStart = true;
      if (char === "{") {
        braceCount = 1;
        continue;
      }
    }

    if (!foundStart) continue;

    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        handlerEnd = i + 1;
        break;
      }
    }
  }

  return fileContent.slice(handlerStart, handlerEnd);
}

/**
 * Extract return examples from handler code
 */
export function extractReturnExamples(
  handlerCode: string,
  httpMethod: HttpMethod
): Record<string, unknown> {
  const examples: Record<string, unknown> = {};

  const responsePatterns = [
    /new\s+Response\s*\(\s*JSON\.stringify\s*\(\s*([^)]+)\s*\)[^)]*status:\s*(\d+)/g,
    /Response\.json\s*\(\s*([^,]+)[^)]*status:\s*(\d+)/g,
    /\bjson\s*\(\s*([^,)]+)(?:,\s*\{\s*status:\s*(\d+))?/g,
    /createTypedResponse\s*\(\s*[^,]+,\s*([^,)]+)(?:,\s*\{\s*status:\s*(\d+))?/g,
    /return\s+(\{[^}]*\})/g
  ];

  for (const pattern of responsePatterns) {
    let match;
    while ((match = pattern.exec(handlerCode)) !== null) {
      const [, responseBody, statusCode] = match;
      const status = statusCode || "200";

      try {
        const cleanedBody = cleanResponseBody(responseBody);
        const parsedExample = parseResponseExample(cleanedBody);
        if (parsedExample) {
          examples[status] = parsedExample;
        }
      } catch {
        examples[status] = generateFallbackExample(responseBody, httpMethod);
      }
    }
  }

  if (Object.keys(examples).length === 0) {
    examples["200"] = generateDefaultExample(httpMethod);
  }

  return examples;
}

/**
 * Clean and normalize response body code
 */
export function cleanResponseBody(body: string): string {
  return body
    .trim()
    .replace(/^\{/, "{")
    .replace(/\}$/, "}")
    .replace(/'/g, '"')
    .replace(/(\w+):/g, '"$1":')
    .replace(/,\s*\}/g, "}");
}

/**
 * Parse response example from code
 */
export function parseResponseExample(body: string): unknown {
  if (body.startsWith("{") && body.endsWith("}")) {
    try {
      return JSON.parse(body);
    } catch {
      const pairs = body
        .slice(1, -1)
        .split(",")
        .map((pair) => pair.trim())
        .filter(Boolean);

      const obj: Record<string, unknown> = {};

      for (const pair of pairs) {
        const [key, value] = pair.split(":").map((s) => s.trim());
        if (key && value) {
          const cleanKey = key.replace(/['"]/g, "");
          const cleanValue = value.replace(/['"]/g, "");

          if (cleanValue === "true" || cleanValue === "false") {
            obj[cleanKey] = cleanValue === "true";
          } else if (!isNaN(Number(cleanValue))) {
            obj[cleanKey] = Number(cleanValue);
          } else {
            obj[cleanKey] = cleanValue;
          }
        }
      }

      return Object.keys(obj).length > 0 ? obj : null;
    }
  }

  return null;
}

/**
 * Generate fallback example when parsing fails
 */
export function generateFallbackExample(responseBody: string, httpMethod: HttpMethod): unknown {
  if (responseBody.includes("success")) {
    return { success: true, message: "Operation completed successfully" };
  }
  if (responseBody.includes("error")) {
    return { error: "An error occurred" };
  }
  if (responseBody.includes("data")) {
    return { data: {}, message: "Data retrieved successfully" };
  }
  return generateDefaultExample(httpMethod);
}

/**
 * Detect Zod schema usage in handler code and load the actual schemas
 */
export async function detectZodSchemas(fileContent: string): Promise<ZodSchemaInfo[]> {
  const zodSchemas: ZodSchemaInfo[] = [];

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let importMatch;

  while ((importMatch = importRegex.exec(fileContent)) !== null) {
    const [, imports, importPath] = importMatch;

    const schemaNames = imports
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.startsWith("z_"));

    for (const schemaName of schemaNames) {
      const searchContent = fileContent;

      const usagePatterns = [
        new RegExp(`${schemaName}\\.safeParse\\s*\\(`, "g"),
        new RegExp(`${schemaName}\\.parse\\s*\\(`, "g"),
        new RegExp(`${schemaName}\\.parseAsync\\s*\\(`, "g"),
        new RegExp(`createTypedResponse\\s*\\(\\s*${schemaName}`, "g")
      ];

      for (const pattern of usagePatterns) {
        const usageMatch = searchContent.match(pattern);
        if (usageMatch) {
          const isResponseSchema =
            pattern.source.includes("createTypedResponse") ||
            schemaName.includes("Success") ||
            schemaName.includes("Error") ||
            schemaName.includes("Response");

          const zodSchemaInfo: ZodSchemaInfo = {
            schemaName,
            importPath,
            usage: usageMatch[0],
            type: isResponseSchema ? "response" : "request"
          };

          try {
            const resolvedPath = resolveImportPath(importPath);
            const schemaModule = await dynamicImport(resolvedPath);
            if (schemaModule[schemaName]) {
              zodSchemaInfo.schema = schemaModule[schemaName] as import("zod").ZodTypeAny;
            }
          } catch (error) {
            console.warn(`Failed to load Zod schema ${schemaName} from ${importPath}:`, error);
          }

          zodSchemas.push(zodSchemaInfo);
          break;
        }
      }
    }
  }

  return zodSchemas;
}

/**
 * Extract request schema information from Zod usage
 */
export function extractZodRequestSchema(zodSchemas: ZodSchemaInfo[]): ZodSchemaInfo | null {
  for (const schema of zodSchemas) {
    if (
      schema.type === "request" &&
      (schema.usage.includes("body") || schema.usage.includes("request"))
    ) {
      return schema;
    }
  }
  const requestSchemas = zodSchemas.filter((s) => s.type === "request");
  return requestSchemas.length > 0 ? requestSchemas[0] : null;
}

/**
 * Extract response schema information from Zod usage
 */
export function extractZodResponseSchemas(zodSchemas: ZodSchemaInfo[]): ZodSchemaInfo[] {
  return zodSchemas.filter((s) => s.type === "response");
}

/**
 * Build a map of schema name -> import path from the file's import statements
 */
function buildImportPathMap(fileContent: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let match;

  while ((match = importRegex.exec(fileContent)) !== null) {
    const [, imports, importPath] = match;
    const names = imports
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      map.set(name, importPath);
    }
  }

  return map;
}

/**
 * Resolve @responseSchema JSDoc references into ZodSchemaInfo objects.
 *
 * This allows response schemas to be declared via JSDoc without importing them
 * in the route file:
 *
 *   @responseSchema z_paymentSuccess - 200
 *   @responseSchema z_paymentError - 400 from $lib/server/schemas/api/payment
 *
 * If no `from` path is provided, it tries to find the schema from:
 * 1. The imports already present in the file
 * 2. The same import paths as existing request schemas
 */
export async function resolveResponseSchemaRefs(
  refs: ResponseSchemaRef[],
  fileContent: string,
  existingSchemas: ZodSchemaInfo[]
): Promise<ZodSchemaInfo[]> {
  const resolvedSchemas: ZodSchemaInfo[] = [];

  const importPathMap = buildImportPathMap(fileContent);

  const existingImportPaths = new Set<string>();
  for (const s of existingSchemas) {
    if (s.importPath) existingImportPaths.add(s.importPath);
  }

  for (const ref of refs) {
    const { schemaName, statusCode, importPath: explicitPath } = ref;

    // Check if this schema was already detected
    const alreadyDetected = existingSchemas.find((s) => s.schemaName === schemaName);
    if (alreadyDetected) {
      resolvedSchemas.push({
        ...alreadyDetected,
        type: "response",
        statusCode
      });
      continue;
    }

    let resolvedImportPath: string | undefined = explicitPath;

    if (!resolvedImportPath) {
      resolvedImportPath = importPathMap.get(schemaName);
    }

    if (!resolvedImportPath) {
      for (const existingPath of existingImportPaths) {
        try {
          const fullPath = resolveImportPath(existingPath);
          const schemaModule = await dynamicImport(fullPath);
          if (schemaModule[schemaName]) {
            resolvedImportPath = existingPath;
            break;
          }
        } catch {
          // Continue searching
        }
      }
    }

    if (!resolvedImportPath) {
      console.warn(
        `@responseSchema: Could not find import path for "${schemaName}". ` +
          `Use "from $lib/path/to/schema" to specify it explicitly.`
      );
      resolvedSchemas.push({
        schemaName,
        importPath: "",
        usage: `@responseSchema ${schemaName}`,
        type: "response",
        statusCode
      });
      continue;
    }

    const zodSchemaInfo: ZodSchemaInfo = {
      schemaName,
      importPath: resolvedImportPath,
      usage: `@responseSchema ${schemaName}`,
      type: "response",
      statusCode
    };

    try {
      const fullPath = resolveImportPath(resolvedImportPath);
      const schemaModule = await dynamicImport(fullPath);
      if (schemaModule[schemaName]) {
        zodSchemaInfo.schema = schemaModule[schemaName] as import("zod").ZodTypeAny;
      } else {
        console.warn(
          `@responseSchema: Schema "${schemaName}" not found in "${resolvedImportPath}". ` +
            `Available exports: ${Object.keys(schemaModule).join(", ")}`
        );
      }
    } catch (error) {
      console.warn(
        `@responseSchema: Failed to load "${schemaName}" from "${resolvedImportPath}":`,
        error
      );
    }

    resolvedSchemas.push(zodSchemaInfo);
  }

  return resolvedSchemas;
}

/**
 * Generate default example based on HTTP method
 */
export function generateDefaultExample(httpMethod: HttpMethod): unknown {
  switch (httpMethod) {
    case "GET":
      return { data: {}, message: "Data retrieved successfully" };
    case "POST":
      return { success: true, message: "Resource created successfully", id: "generated_id" };
    case "PUT":
    case "PATCH":
      return { success: true, message: "Resource updated successfully" };
    case "DELETE":
      return { success: true, message: "Resource deleted successfully" };
    default:
      return { message: "Operation completed successfully" };
  }
}
