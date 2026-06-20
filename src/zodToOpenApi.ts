import { z } from "zod";
import { faker } from "@faker-js/faker";
import { fake, setFaker } from "zod-schema-faker/v4";

let initialized = false;

/** Lazily initialize zod-schema-faker with the faker instance on first use. */
function ensureFakerInitialized() {
  if (!initialized) {
    setFaker(faker);
    faker.seed(42);
    initialized = true;
  }
}

type FieldExampleGenerator = () => unknown;

/** Semantic defaults used only when the generated value satisfies the field schema. */
const FIELD_EXAMPLE_GENERATORS: Record<string, FieldExampleGenerator> = {
  id: () => faker.string.uuid(),
  uuid: () => faker.string.uuid(),
  sessionid: () => `session_${faker.string.alphanumeric(16)}`,
  transactionid: () => `txn_${faker.string.alphanumeric(12)}`,
  reference: () => `ref_${faker.string.alphanumeric(12)}`,
  accesscode: () => `access_${faker.string.alphanumeric(12)}`,
  authorizationcode: () => `auth_${faker.string.alphanumeric(12)}`,
  customercode: () => `cus_${faker.string.alphanumeric(12)}`,
  referralcode: () => `REF${faker.string.alphanumeric(6).toUpperCase()}`,
  code: () => faker.string.alphanumeric(8).toUpperCase(),
  token: () => `tok_${faker.string.alphanumeric(24)}`,
  key: () => `key_${faker.string.alphanumeric(20)}`,
  apikey: () => `key_${faker.string.alphanumeric(20)}`,
  clientkey: () => `client_${faker.string.alphanumeric(20)}`,
  tenantclientkey: () => `client_${faker.string.alphanumeric(20)}`,
  secret: () => `secret_${faker.string.alphanumeric(24)}`,
  testkey: () => `test_${faker.string.alphanumeric(20)}`,
  email: () => faker.internet.email(),
  phone: () => "+233201234567",
  phonenumber: () => "+233201234567",
  internationalformatphone: () => "+233201234567",
  name: () => faker.person.fullName(),
  fullname: () => faker.person.fullName(),
  firstname: () => faker.person.firstName(),
  lastname: () => faker.person.lastName(),
  username: () => faker.internet.username(),
  accountname: () => faker.person.fullName(),
  assignedname: () => faker.person.fullName(),
  address: () => faker.location.streetAddress(),
  city: () => faker.location.city(),
  country: () => faker.location.countryCode(),
  countrycode: () => faker.location.countryCode(),
  currency: () => faker.finance.currencyCode(),
  amount: () => faker.number.int({ min: 1000, max: 100000 }),
  requestedamount: () => faker.number.int({ min: 1000, max: 100000 }),
  price: () => faker.number.int({ min: 1000, max: 100000 }),
  discount: () => faker.number.int({ min: 0, max: 50 }),
  fees: () => faker.number.int({ min: 0, max: 5000 }),
  count: () => faker.number.int({ min: 1, max: 100 }),
  totalcount: () => faker.number.int({ min: 1, max: 500 }),
  page: () => 1,
  limit: () => 20,
  offset: () => 0,
  success: () => true,
  active: () => true,
  enabled: () => true,
  verified: () => true,
  isactive: () => true,
  isverified: () => true,
  isundermaintenance: () => false,
  status: () => "success",
  domain: () => "test",
  channel: () => "card",
  gatewayresponse: () => "Approved",
  receiptnumber: () => `receipt_${faker.string.alphanumeric(10)}`,
  type: () => "standard",
  role: () => "user",
  message: () => "Operation completed successfully.",
  error: () => "The request could not be completed.",
  description: () => faker.lorem.sentence(),
  reason: () => faker.lorem.sentence(),
  title: () => faker.lorem.words(3),
  label: () => faker.lorem.words(2),
  url: () => faker.internet.url(),
  callbackurl: () => `${faker.internet.url()}/callback`,
  redirecturl: () => `${faker.internet.url()}/redirect`,
  authorizationurl: () => `${faker.internet.url()}/authorize`,
  ipaddress: () => faker.internet.ipv4(),
  date: () => faker.date.recent().toISOString().slice(0, 10),
  createdat: () => faker.date.past().toISOString(),
  updatedat: () => faker.date.recent().toISOString(),
  expiresat: () => faker.date.future().toISOString(),
  paidat: () => faker.date.recent().toISOString(),
  timestamp: () => faker.date.recent().toISOString()
};

function normalizeFieldName(fieldName: string): string {
  return fieldName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getFieldExample(
  zodSchema: z.ZodTypeAny,
  fieldName: string
): unknown | undefined {
  ensureFakerInitialized();

  const normalized = normalizeFieldName(fieldName);
  let generator = FIELD_EXAMPLE_GENERATORS[normalized];

  if (!generator) {
    if (normalized.endsWith("id")) generator = FIELD_EXAMPLE_GENERATORS.id;
    else if (normalized.endsWith("email")) generator = FIELD_EXAMPLE_GENERATORS.email;
    else if (normalized.endsWith("phone")) generator = FIELD_EXAMPLE_GENERATORS.phone;
    else if (normalized.endsWith("name")) generator = FIELD_EXAMPLE_GENERATORS.name;
    else if (normalized.endsWith("url")) generator = FIELD_EXAMPLE_GENERATORS.url;
    else if (normalized.endsWith("code")) generator = FIELD_EXAMPLE_GENERATORS.code;
    else if (normalized.endsWith("token")) generator = FIELD_EXAMPLE_GENERATORS.token;
    else if (normalized.endsWith("at")) generator = FIELD_EXAMPLE_GENERATORS.updatedat;
    else if (normalized.startsWith("is") || normalized.startsWith("has")) {
      generator = FIELD_EXAMPLE_GENERATORS.enabled;
    }
  }

  if (!generator) return undefined;

  const candidate = generator();
  try {
    return zodSchema.safeParse(candidate).success ? candidate : undefined;
  } catch {
    return undefined;
  }
}

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
function extractDescribeExample(
  zodSchema: z.ZodTypeAny,
  def: Record<string, unknown>
): unknown | undefined {
  const description = zodSchema.description || (def.description as string | undefined);
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
 * 2. A semantic field-name-aware value that passes the field schema
 * 3. zod-schema-faker for generic schema-driven generation
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
    const describeExample = extractDescribeExample(zodSchema, def);
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

    if (fieldName) {
      const fieldExample = getFieldExample(zodSchema, fieldName);
      if (fieldExample !== undefined) {
        return fieldExample;
      }
    }

    // Priority 3: Use zod-schema-faker for all other types
    ensureFakerInitialized();
    return fake(zodSchema);
  } catch (error) {
    console.warn("Error generating example from Zod schema:", error);
    return "example_value";
  }
}
