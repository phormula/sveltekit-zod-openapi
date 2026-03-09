import { z } from "zod";
import { fake, seed } from "zod-schema-faker/v4";

// Seed for deterministic examples across runs
seed(42);

/**
 * Convert a Zod schema to OpenAPI 3.0 schema format
 * Works with Zod v3 and v4
 */
export function zodToOpenApiSchema(zodSchema: z.ZodTypeAny): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = zodSchema._def as any;
    const typeName = def.type || def.typeName;

    // Handle optional/nullable types by unwrapping
    if (
      typeName === "ZodOptional" ||
      typeName === "ZodNullable" ||
      typeName === "optional" ||
      typeName === "nullable"
    ) {
      return zodToOpenApiSchema(def.innerType);
    }

    // Handle object schemas
    if ((typeName === "ZodObject" || typeName === "object") && "shape" in def) {
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];

      const shape =
        typeof def.shape === "function"
          ? (def.shape as () => Record<string, z.ZodTypeAny>)()
          : (def.shape as Record<string, z.ZodTypeAny>);

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        properties[key] = zodToOpenApiSchema(fieldSchema);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fieldDef = fieldSchema._def as any;
        const fieldTypeName = fieldDef.type || fieldDef.typeName;
        const isOptional =
          fieldTypeName === "ZodOptional" ||
          fieldTypeName === "optional" ||
          fieldTypeName === "ZodNullable" ||
          fieldTypeName === "nullable";
        if (!isOptional) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false
      };
    }

    // Handle string schemas with validation rules
    if (typeName === "ZodString" || typeName === "string") {
      const schema: Record<string, unknown> = { type: "string" };

      if (def.checks && Array.isArray(def.checks)) {
        for (const check of def.checks) {
          const checkKind = check.kind;
          const checkConstructor = check.constructor?.name;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const zodMeta = (check as any)._zod;
          const zodDef = zodMeta?.def;

          if (
            checkKind === "email" ||
            checkConstructor === "ZodEmail" ||
            check.format === "email"
          ) {
            schema.format = "email";
          } else if (
            checkKind === "url" ||
            checkConstructor === "ZodUrl" ||
            check.format === "url"
          ) {
            schema.format = "uri";
          } else if (
            checkKind === "uuid" ||
            checkConstructor === "ZodUuid" ||
            check.format === "uuid"
          ) {
            schema.format = "uuid";
          } else if (
            checkKind === "min" ||
            checkConstructor === "$ZodCheckMinLength" ||
            zodDef?.check === "min_length"
          ) {
            schema.minLength = check.value || zodDef?.minimum;
          } else if (
            checkKind === "max" ||
            checkConstructor === "$ZodCheckMaxLength" ||
            zodDef?.check === "max_length"
          ) {
            schema.maxLength = check.value || zodDef?.maximum;
          } else if (
            checkKind === "regex" ||
            checkConstructor === "$ZodCheckRegex" ||
            zodDef?.format === "regex"
          ) {
            schema.pattern = check.regex?.source || zodDef?.pattern?.source;
          }
        }
      }

      return schema;
    }

    // Handle number schemas
    if (typeName === "ZodNumber" || typeName === "number") {
      const schema: Record<string, unknown> = { type: "number" };

      if (def.checks && Array.isArray(def.checks)) {
        for (const check of def.checks) {
          if (check.kind === "min") {
            schema.minimum = check.value;
          } else if (check.kind === "max") {
            schema.maximum = check.value;
          } else if (check.kind === "int") {
            schema.type = "integer";
          }
        }
      }

      return schema;
    }

    // Handle boolean schemas
    if (typeName === "ZodBoolean" || typeName === "boolean") {
      return { type: "boolean" };
    }

    // Handle enum schemas
    if (typeName === "ZodEnum" || typeName === "enum") {
      return {
        type: "string",
        enum: def.values
      };
    }

    // Handle literal schemas
    if (typeName === "ZodLiteral" || typeName === "literal") {
      const value = def.value !== undefined ? def.value : def.values?.[0];
      return {
        type: typeof value,
        enum: [value]
      };
    }

    // Handle array schemas
    if (typeName === "ZodArray" || typeName === "array") {
      const itemSchema = def.type ? zodToOpenApiSchema(def.type) : { type: "string" };
      return {
        type: "array",
        items: itemSchema
      };
    }

    // Handle record schemas
    if (typeName === "ZodRecord" || typeName === "record") {
      const valueType = def.valueType ? zodToOpenApiSchema(def.valueType) : { type: "string" };
      return {
        type: "object",
        additionalProperties: valueType
      };
    }

    // Default fallback
    return { type: "object", additionalProperties: true };
  } catch (error) {
    console.warn("Error converting Zod schema to OpenAPI:", error);
    return { type: "object", additionalProperties: true };
  }
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
