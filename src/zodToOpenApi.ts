import { z } from "zod";
import { fake, seed } from "zod-schema-faker/v4";

// Seed for deterministic examples across runs
seed(42);

/**
 * Convert a Zod schema to OpenAPI 3.0 schema format.
 * Uses Zod v4's built-in toJSONSchema() and normalizes for OpenAPI 3.0 compatibility.
 */
export function zodToOpenApiSchema(zodSchema: z.ZodTypeAny): Record<string, unknown> {
  try {
    const jsonSchema = z.toJSONSchema(zodSchema) as Record<string, unknown>;
    return normalizeForOpenApi3(jsonSchema);
  } catch (error) {
    console.warn("Error converting Zod schema to OpenAPI:", error);
    return { type: "object", additionalProperties: true };
  }
}

/**
 * Recursively normalize a JSON Schema 2020-12 object to be compatible with OpenAPI 3.0:
 * - Strips `$schema`
 * - Converts `const` to `enum: [value]`
 * - Converts `anyOf: [{type: T}, {type: "null"}]` to `{type: T, nullable: true}`
 * - Recurses into `properties`, `items`, `additionalProperties`, `anyOf`, `oneOf`, `allOf`
 */
function normalizeForOpenApi3(schema: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...rest } = schema;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (key === "const") {
      // OpenAPI 3.0 doesn't support `const`, use enum with a single value
      result.enum = [value];
    } else if (key === "anyOf" && Array.isArray(value)) {
      // Check for nullable pattern: anyOf: [{type: T}, {type: "null"}]
      const nonNull = value.filter(
        (v: Record<string, unknown>) => !(v && typeof v === "object" && v.type === "null")
      );
      const hasNull = nonNull.length < value.length;
      if (hasNull && nonNull.length === 1) {
        // Collapse to the non-null schema + nullable: true
        const inner = normalizeForOpenApi3(nonNull[0] as Record<string, unknown>);
        Object.assign(result, inner, { nullable: true });
      } else {
        result.anyOf = value.map((v: Record<string, unknown>) =>
          v && typeof v === "object" ? normalizeForOpenApi3(v) : v
        );
      }
    } else if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] =
          propVal && typeof propVal === "object"
            ? normalizeForOpenApi3(propVal as Record<string, unknown>)
            : propVal;
      }
      result.properties = props;
    } else if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      result.items = normalizeForOpenApi3(value as Record<string, unknown>);
    } else if (
      key === "additionalProperties" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result.additionalProperties = normalizeForOpenApi3(value as Record<string, unknown>);
    } else if ((key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      result[key] = value.map((v: Record<string, unknown>) =>
        v && typeof v === "object" ? normalizeForOpenApi3(v) : v
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract an example hint from a Zod schema's .describe() value.
 * Supports:
 *   .describe("example:All systems operational")
 *   .describe("example:42")       → parsed as number
 *   .describe("example:true")     → parsed as boolean
 *   .describe("example:{...}")    → parsed as JSON
 *
 * Returns undefined if no example hint is found.
 */
function extractDescribeExample(def: Record<string, unknown>): unknown | undefined {
  const description = def.description as string | undefined;
  if (!description) return undefined;

  const match = description.match(/^example:(.+)$/i);
  if (!match) return undefined;

  const hint = match[1].trim();

  try {
    return JSON.parse(hint);
  } catch {
    return hint;
  }
}

/**
 * Generate example data from a Zod schema.
 *
 * Priority order for example values:
 * 1. .describe("example:...") hint on the field
 * 2. zod-schema-faker for generic schema-driven generation
 *
 * @param zodSchema - The Zod schema to generate an example for
 * @param fieldName - Optional field name (unused, kept for API compatibility)
 */
export function generateExampleFromZodSchema(zodSchema: z.ZodTypeAny, fieldName?: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = zodSchema._def as any;
    const typeName = def.type || def.typeName;

    // Priority 1: Check .describe("example:...") hint
    const describeExample = extractDescribeExample(def);
    if (describeExample !== undefined) {
      return describeExample;
    }

    // Handle optional/nullable types by unwrapping
    if (
      typeName === "ZodOptional" ||
      typeName === "optional" ||
      typeName === "ZodNullable" ||
      typeName === "nullable"
    ) {
      return generateExampleFromZodSchema(def.innerType, fieldName);
    }

    // Handle object schemas: walk shape to support per-field describe hints
    if ((typeName === "ZodObject" || typeName === "object") && "shape" in def) {
      const example: Record<string, unknown> = {};

      const shape =
        typeof def.shape === "function"
          ? (def.shape as () => Record<string, z.ZodTypeAny>)()
          : (def.shape as Record<string, z.ZodTypeAny>);

      for (const [key, value] of Object.entries(shape)) {
        example[key] = generateExampleFromZodSchema(value as z.ZodTypeAny, key);
      }

      return example;
    }

    // Priority 2: Use zod-schema-faker for all other types
    return fake(zodSchema);
  } catch (error) {
    console.warn("Error generating example from Zod schema:", error);
    return "example_value";
  }
}
