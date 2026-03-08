import { z } from "zod";
import { faker } from "@faker-js/faker";

// Seed faker for deterministic examples across runs
faker.seed(42);

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
 * Field-name-aware faker generators.
 * Maps common field name patterns to faker calls for realistic example values.
 */
const FIELD_NAME_GENERATORS: Record<string, () => unknown> = {
  // Identity
  id: () => faker.string.alphanumeric(8),
  uuid: () => faker.string.uuid(),
  // Status / flags
  success: () => true,
  status: () => faker.helpers.arrayElement(["active", "inactive", "pending"]),
  active: () => faker.datatype.boolean(),
  enabled: () => faker.datatype.boolean(),
  verified: () => faker.datatype.boolean(),
  isUnderMaintenance: () => false,
  is_active: () => faker.datatype.boolean(),
  is_verified: () => faker.datatype.boolean(),
  // Messages
  message: () => faker.lorem.sentence(),
  error: () => faker.lorem.sentence(),
  description: () => faker.lorem.sentence(),
  reason: () => faker.lorem.sentence(),
  title: () => faker.lorem.words(3),
  label: () => faker.lorem.words(2),
  // User / contact
  name: () => faker.person.fullName(),
  first_name: () => faker.person.firstName(),
  firstName: () => faker.person.firstName(),
  last_name: () => faker.person.lastName(),
  lastName: () => faker.person.lastName(),
  username: () => faker.internet.username(),
  email: () => faker.internet.email(),
  phone: () => faker.phone.number(),
  phone_number: () => faker.phone.number(),
  phoneNumber: () => faker.phone.number(),
  address: () => faker.location.streetAddress(),
  city: () => faker.location.city(),
  country: () => faker.location.countryCode(),
  // Financial
  amount: () => faker.finance.amount({ min: 10, max: 1000, dec: 2 }),
  price: () => faker.finance.amount({ min: 1, max: 500, dec: 2 }),
  total: () => faker.finance.amount({ min: 10, max: 2000, dec: 2 }),
  currency: () => faker.finance.currencyCode(),
  reference: () => `ref_${faker.string.alphanumeric(12)}`,
  transactionId: () => `txn_${faker.string.alphanumeric(8)}`,
  transaction_id: () => `txn_${faker.string.alphanumeric(8)}`,
  authorization_url: () => faker.internet.url(),
  access_code: () => `access_${faker.string.alphanumeric(8)}`,
  // Dates
  date: () => faker.date.recent().toISOString().split("T")[0],
  created_at: () => faker.date.past().toISOString(),
  createdAt: () => faker.date.past().toISOString(),
  updated_at: () => faker.date.recent().toISOString(),
  updatedAt: () => faker.date.recent().toISOString(),
  expires_at: () => faker.date.future().toISOString(),
  timestamp: () => faker.date.recent().toISOString(),
  // URLs / codes
  url: () => faker.internet.url(),
  callback_url: () => `${faker.internet.url()}/callback`,
  redirect_url: () => `${faker.internet.url()}/redirect`,
  code: () => faker.string.alphanumeric(6).toUpperCase(),
  token: () => `tok_${faker.string.alphanumeric(16)}`,
  referral_code: () => `REF${faker.string.alphanumeric(4).toUpperCase()}`,
  // Misc
  type: () => faker.helpers.arrayElement(["standard", "premium", "basic"]),
  role: () => faker.helpers.arrayElement(["user", "admin", "moderator"]),
  count: () => faker.number.int({ min: 1, max: 100 }),
  page: () => 1,
  limit: () => 20,
  offset: () => 0,
  total_count: () => faker.number.int({ min: 10, max: 500 })
};

/**
 * Get a contextual example value based on the field name using faker.
 * Returns undefined if no match is found.
 */
function getFieldNameExample(fieldName: string): unknown | undefined {
  // Direct match
  if (fieldName in FIELD_NAME_GENERATORS) {
    return FIELD_NAME_GENERATORS[fieldName]();
  }

  // Case-insensitive match
  const lower = fieldName.toLowerCase();
  for (const [key, generator] of Object.entries(FIELD_NAME_GENERATORS)) {
    if (key.toLowerCase() === lower) return generator();
  }

  // Partial / suffix match for common patterns
  if (lower.endsWith("_id") || lower.endsWith("id")) return faker.string.alphanumeric(8);
  if (lower.endsWith("_url") || lower.endsWith("url")) return faker.internet.url();
  if (lower.endsWith("_at") || lower.endsWith("at")) return faker.date.recent().toISOString();
  if (lower.endsWith("email")) return faker.internet.email();
  if (lower.endsWith("phone")) return faker.phone.number();
  if (lower.endsWith("name")) return faker.person.fullName();
  if (lower.startsWith("is_") || lower.startsWith("is")) return faker.datatype.boolean();
  if (lower.startsWith("has_") || lower.startsWith("has")) return faker.datatype.boolean();
  if (lower.endsWith("_code") || lower.endsWith("code")) return faker.string.alphanumeric(6).toUpperCase();
  if (lower.endsWith("_token") || lower.endsWith("token")) return `tok_${faker.string.alphanumeric(12)}`;
  if (lower.includes("message") || lower.includes("msg")) return faker.lorem.sentence();
  if (lower.includes("error")) return faker.lorem.sentence();
  if (lower.includes("amount") || lower.includes("price") || lower.includes("total"))
    return Number(faker.finance.amount({ min: 10, max: 1000, dec: 2 }));

  return undefined;
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
 * 2. Field-name-aware contextual example
 * 3. Format/validation-based example (email, url, uuid, etc.)
 * 4. Generic fallback
 *
 * @param zodSchema - The Zod schema to generate an example for
 * @param fieldName - Optional field name for context-aware examples
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

    // Handle object schemas
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

    // Handle string schemas with validation rules
    if (typeName === "ZodString" || typeName === "string") {
      // Priority 2: Field-name-aware example
      if (fieldName) {
        const fieldExample = getFieldNameExample(fieldName);
        if (fieldExample !== undefined && typeof fieldExample === "string") {
          return fieldExample;
        }
      }

      let minLength = 1;
      let maxLength = 50;
      let format: string | null = null;
      let pattern: string | null = null;

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
            format = "email";
          } else if (
            checkKind === "url" ||
            checkConstructor === "ZodUrl" ||
            check.format === "url"
          ) {
            format = "url";
          } else if (
            checkKind === "uuid" ||
            checkConstructor === "ZodUuid" ||
            check.format === "uuid"
          ) {
            format = "uuid";
          } else if (
            checkKind === "min" ||
            checkConstructor === "$ZodCheckMinLength" ||
            zodDef?.check === "min_length"
          ) {
            minLength = check.value || zodDef?.minimum || 1;
          } else if (
            checkKind === "max" ||
            checkConstructor === "$ZodCheckMaxLength" ||
            zodDef?.check === "max_length"
          ) {
            maxLength = check.value || zodDef?.maximum || 50;
          } else if (
            checkKind === "regex" ||
            checkConstructor === "$ZodCheckRegex" ||
            zodDef?.format === "regex"
          ) {
            pattern = check.regex?.source || zodDef?.pattern?.source || null;
          }
        }
      }

      // Priority 3: Format-based example
      if (format === "email") {
        return "user@example.com";
      } else if (format === "url") {
        return "https://example.com";
      } else if (format === "uuid") {
        return "123e4567-e89b-12d3-a456-426614174000";
      } else if (pattern) {
        if (pattern.includes("0-9+")) {
          return "+233201234567";
        }
        return "example_string";
      } else {
        if (minLength >= 10) {
          const exampleText = fieldName
            ? `Example ${fieldName.replace(/_/g, " ")} value`
            : "This is an example message that meets the length requirements";
          if (exampleText.length < minLength) {
            return exampleText.padEnd(minLength, " and additional content");
          } else if (exampleText.length > maxLength) {
            return exampleText.substring(0, maxLength);
          }
          return exampleText;
        } else {
          const exampleText = fieldName
            ? getFieldNameExample(fieldName)?.toString() || fieldName.replace(/_/g, " ")
            : "example text";
          if (exampleText.length < minLength) {
            return exampleText.padEnd(minLength, "x");
          } else if (exampleText.length > maxLength) {
            return exampleText.substring(0, maxLength);
          }
          return exampleText;
        }
      }
    }

    // Handle number schemas
    if (typeName === "ZodNumber" || typeName === "number") {
      if (fieldName) {
        const fieldExample = getFieldNameExample(fieldName);
        if (fieldExample !== undefined && typeof fieldExample === "number") {
          return fieldExample;
        }
      }

      let min = 0;
      let max = 100;
      if (def.checks && Array.isArray(def.checks)) {
        for (const check of def.checks) {
          if (check.kind === "min") min = check.value;
          else if (check.kind === "max") max = check.value;
        }
      }
      return Math.floor((min + max) / 2);
    }

    // Handle boolean schemas
    if (typeName === "ZodBoolean" || typeName === "boolean") {
      if (fieldName) {
        const fieldExample = getFieldNameExample(fieldName);
        if (fieldExample !== undefined && typeof fieldExample === "boolean") {
          return fieldExample;
        }
      }
      return true;
    }

    // Handle enum schemas
    if (typeName === "ZodEnum" || (typeName === "enum" && def.values && def.values.length > 0)) {
      return def.values[0];
    }

    // Handle literal schemas
    if (typeName === "ZodLiteral" || typeName === "literal") {
      return def.value !== undefined ? def.value : def.values?.[0];
    }

    // Handle array schemas
    if (typeName === "ZodArray" || typeName === "array") {
      if (def.type) {
        return [generateExampleFromZodSchema(def.type, fieldName)];
      }
      return ["example_item"];
    }

    // Handle record schemas
    if (typeName === "ZodRecord" || typeName === "record") {
      return {
        email: faker.internet.email(),
        first_name: faker.person.firstName(),
        last_name: faker.person.lastName(),
        phone: faker.phone.number(),
        metadata: {
          referral_code: `REF${faker.string.alphanumeric(4).toUpperCase()}`,
          custom_field: faker.lorem.word()
        }
      };
    }

    // Default fallback
    return fieldName ? `example_${fieldName}` : "example_value";
  } catch (error) {
    console.warn("Error generating example from Zod schema:", error);
    return "example_value";
  }
}
