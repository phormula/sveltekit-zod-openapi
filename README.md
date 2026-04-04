# sveltekit-openapi-docs

Auto-generate **OpenAPI 3.0** specifications from your SvelteKit API routes — with full **Zod schema** support, field-aware examples, and zero unused imports.

## Features

- **Automatic Zod Schema Detection** — Finds `z_*` schemas imported and used via `.safeParse()` / `.parse()`
- **`@responseSchema` JSDoc Tags** — Declare response schemas in JSDoc comments without importing them in your route
- **Endpoint Grouping with Tags** — Group related operations in Swagger/Scalar with `@tag` / `@tags`
- **Field-Name-Aware Examples** — Generates realistic examples based on field names (`email`, `phone`, `amount`, etc.)
- **`.describe("example:...")` Hints** — Override any field's example via Zod's `.describe()` method
- **`@example` JSDoc Overrides** — Replace Zod-generated examples per status code with hand-written JSON
- **Schema Constraints** — Extracts `minLength`, `maxLength`, `format`, `pattern`, `enum`, etc.
- **Authentication Detection** — Auto-detects auth requirements from HTTP method, route path, or `@auth` tag
- **Zod v3 & v4 Compatible** — Works with both Zod v3 (`_def.typeName`) and v4 (`_def.type`)

## Quick Start

### 1. Install

```bash
# From a local path (monorepo)
npm install ./packages/sveltekit-openapi-docs

# Or publish to npm and install normally
npm install sveltekit-openapi-docs
```

Peer dependencies: `zod` (>=3.19) and `comment-parser` (>=1.4).

### 2. Create a Generator Script

```ts
// generate-docs.mjs
import { generateDocs } from "sveltekit-openapi-docs";

await generateDocs({
  routesDir: "src/routes/(api)",
  outputPath: "static/openapi/swagger.json",
  title: "My API",
  version: "1.0.0"
});
```

### 3. Add an npm Script

```json
{
  "scripts": {
    "generate:docs": "tsx generate-docs.mjs"
  }
}
```

### 4. Run

```bash
npm run generate:docs
```

### 5. View the API Docs

Install [Scalar](https://github.com/scalar/scalar) to serve a beautiful API reference UI from your generated spec:

```bash
npm install @scalar/sveltekit
```

Create a route to serve the docs (e.g. `src/routes/docs/+server.ts`):

```ts
// src/routes/docs/+server.ts
import { ScalarApiReference } from "@scalar/sveltekit";
import type { RequestHandler } from "@sveltejs/kit";

const render = ScalarApiReference({
  url: "/openapi/swagger.json",
  theme: "purple"
});

export const GET: RequestHandler = () => {
  return render();
};
```

Then visit `http://localhost:5173/docs` to browse your API documentation.

> **Tip:** If you use the Vite plugin (see below), the spec is regenerated automatically on dev server start — so the docs are always up to date.

---

## Vite Plugin

Instead of a separate script, you can use the Vite plugin to auto-generate the spec on every dev server start and production build:

```ts
// vite.config.ts
import { sveltekit } from "@sveltejs/kit/vite";
import { sveltekitOpenApi } from "sveltekit-openapi-docs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    sveltekitOpenApi({
      routesDir: "src/routes/(api)",
      outputPath: "static/openapi/swagger.json",
      title: "My API",
      version: "1.0.0"
    })
  ]
});
```

Set `devMode: "routeChange"` to also regenerate whenever a `+server.ts` file is saved during development.

---

## How It Works

The generator scans your SvelteKit `+server.ts` files, extracts JSDoc comments and Zod schema usage, then builds a complete OpenAPI 3.0 spec.

### Automatic Schema Detection

Any `z_*`-prefixed import used with `.safeParse()`, `.parse()`, or `.parseAsync()` is automatically detected:

```ts
// src/routes/(api)/contact/+server.ts
import { z_contactForm } from "$lib/server/schemas/api/contact";

/**
 * @summary Submit contact form
 */
export async function POST({ request }) {
  const body = await request.json();
  const result = z_contactForm.safeParse(body); // ← detected as request schema
  // ...
  return json({ success: true, message: "Submitted" });
}
```

The generator will:

1. Load `z_contactForm` from the import path
2. Convert it to an OpenAPI request body schema
3. Generate field-aware examples (email → `"user@example.com"`, phone → `"+233201234567"`, etc.)

### `@responseSchema` — Response Schemas Without Imports

Use `@responseSchema` tags to declare response schemas in JSDoc **without importing them** in your route file. This avoids unused import warnings:

```ts
/**
 * @summary Get maintenance status
 * @responseSchema z_maintenanceSchema - 200 from $lib/server/schemas/api/maintenance
 * @responseSchema z_maintenanceError - 404 from $lib/server/schemas/api/maintenance
 * @responseSchema z_maintenanceError - 500 from $lib/server/schemas/api/maintenance
 */
export async function GET() {
  // Only import the schemas you actually use in code
  return json({ success: true, isUnderMaintenance: false, message: "All systems operational" });
}
```

**Format:** `@responseSchema <schemaName> - <statusCode> [from <importPath>]`

- `schemaName` — The exported Zod schema name (e.g., `z_maintenanceSchema`)
- `statusCode` — HTTP status code this schema represents (e.g., `200`, `404`, `500`)
- `from <importPath>` — Optional. If omitted, the generator tries to resolve it from existing imports or sibling schemas

The same schema can be mapped to multiple status codes (e.g., an error schema for both 404 and 500).

---

## Example Generation Priority

For each field in a Zod schema, examples are generated in this priority order:

### 1. `.describe("example:...")` Hint (Highest Priority)

```ts
const z_payment = z.object({
  amount: z.number().describe("example:250.00"),
  currency: z.string().describe("example:USD"),
  note: z.string().describe("example:Payment for order #1234")
});
```

### 2. Field-Name-Aware Example

The generator recognizes ~70 common field name patterns:

| Field Name             | Example Value                            |
| ---------------------- | ---------------------------------------- |
| `email`                | `"user@example.com"`                     |
| `phone`, `phoneNumber` | `"+233201234567"`                        |
| `name`                 | `"John Doe"`                             |
| `amount`, `price`      | `100.0`                                  |
| `currency`             | `"GHS"`                                  |
| `message`              | `"Operation completed successfully"`     |
| `success`              | `true`                                   |
| `isUnderMaintenance`   | `false`                                  |
| `url`                  | `"https://example.com"`                  |
| `createdAt`            | `"2026-03-08T12:00:00Z"`                 |
| `transactionId`        | `"txn_abc123"`                           |
| `authorization_url`    | `"https://checkout.paystack.com/abc123"` |

See the full list in [zodToOpenApi.ts](src/zodToOpenApi.ts).

### 3. Format/Validation-Based Example

| Zod Validation         | Example                                  |
| ---------------------- | ---------------------------------------- |
| `.email()`             | `"user@example.com"`                     |
| `.url()`               | `"https://example.com"`                  |
| `.uuid()`              | `"123e4567-e89b-12d3-a456-426614174000"` |
| `.regex(/^[0-9+].../)` | `"+233201234567"`                        |
| `.min(10)`             | String padded to minimum length          |

### 4. Generic Fallback

`"example text"` for strings, `50` for numbers, `true` for booleans.

---

## JSDoc Tags Reference

| Tag                   | Description                     | Example                                         |
| --------------------- | ------------------------------- | ----------------------------------------------- |
| `@summary`            | Short operation summary         | `@summary Get user profile`                     |
| `@description`        | Longer description              | `@description Returns the full user profile...` |
| `@response`           | Status code description         | `@response 200 Successfully retrieved`          |
| `@example`            | JSON example for a status code  | `@example 200 {"success": true}`                |
| `@tag` / `@tags`      | Group operations in docs UI     | `@tag Users` or `@tags Users, Admin`            |
| `@responseSchema`     | Map a Zod schema to a response  | `@responseSchema z_userResponse - 200`          |
| `@auth`               | Explicitly set auth requirement | `@auth true` or `@auth false`                   |
| `@hidden` / `@ignore` | Skip this handler               | `@hidden`                                       |

### `@tag` Grouping

Use `@tag` for a single group or `@tags` for a comma-separated list:

```ts
/**
 * @summary List users
 * @tag Users
 */

/**
 * @summary Invite an admin
 * @tags Users, Admin
 */
```

### `@example` Override

When used alongside `@responseSchema`, the `@example` tag overrides the Zod-generated example for that status code:

```ts
/**
 * @responseSchema z_maintenanceSchema - 200 from $lib/server/schemas/api/maintenance
 * @example 200 {"success": true, "isUnderMaintenance": false, "message": "All systems operational"}
 */
```

---

## Configuration

```ts
import { generateDocs } from "sveltekit-openapi-docs";

await generateDocs({
  // Required
  routesDir: "src/routes/(api)",
  outputPath: "static/openapi/swagger.json",

  // Optional
  title: "My API", // Default: "API Documentation"
  version: "2.0.0", // Default: "1.0.0"
  description: "My awesome API", // Optional description

  // Import path aliases (default: { "$lib": "src/lib" })
  aliases: {
    $lib: "src/lib",
    $server: "src/server"
  },

  // Custom security schemes (default: apiKey + bearerAuth)
  securitySchemes: {
    apiKey: {
      type: "apiKey",
      name: "X-API-Key",
      in: "header",
      description: "API key authentication"
    },
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Bearer token authentication"
    }
  },

  // Custom auth resolver (optional)
  authResolver: (method, routePath, info) => {
    if (routePath?.startsWith("/payment/")) return true;
    if (routePath?.startsWith("/public/")) return false;
    return undefined; // fall through to defaults
  }
});
```

---

## Supported Zod Types

| Zod Type              | OpenAPI Type                      | Example                              |
| --------------------- | --------------------------------- | ------------------------------------ |
| `z.string()`          | `string`                          | Field-name-aware or `"example text"` |
| `z.string().email()`  | `string` + `format: email`        | `"user@example.com"`                 |
| `z.string().url()`    | `string` + `format: uri`          | `"https://example.com"`              |
| `z.string().uuid()`   | `string` + `format: uuid`         | `"123e4567-..."`                     |
| `z.string().min(n)`   | `string` + `minLength`            | Padded string                        |
| `z.string().max(n)`   | `string` + `maxLength`            | Truncated string                     |
| `z.string().regex(r)` | `string` + `pattern`              | Pattern-aware                        |
| `z.number()`          | `number`                          | `50` (midpoint of range)             |
| `z.number().int()`    | `integer`                         | `50`                                 |
| `z.number().min(n)`   | `number` + `minimum`              | Midpoint                             |
| `z.boolean()`         | `boolean`                         | `true`                               |
| `z.enum([...])`       | `string` + `enum`                 | First value                          |
| `z.literal(v)`        | Type + `enum: [v]`                | The literal value                    |
| `z.array(schema)`     | `array` + `items`                 | `[itemExample]`                      |
| `z.object({...})`     | `object` + `properties`           | Nested examples                      |
| `z.record(schema)`    | `object` + `additionalProperties` | Sample object                        |
| `.optional()`         | Excluded from `required`          | Same as base type                    |
| `.nullable()`         | Unwrapped                         | Same as base type                    |

---

## Complete Example

### Schema

```ts
// src/lib/server/schemas/api/maintenance.ts
import { z } from "zod";

export const z_maintenanceSchema = z.object({
  success: z.literal(true),
  isUnderMaintenance: z.boolean(),
  message: z.string().optional()
});

export const z_maintenanceError = z.object({
  success: z.literal(false),
  message: z.string()
});
```

### Route

```ts
// src/routes/(api)/api/maintenance/+server.ts
import { json } from "@sveltejs/kit";

/**
 * @summary Get maintenance status
 * @description Provides maintenance status information
 * @tag Maintenance
 * @auth false
 * @responseSchema z_maintenanceSchema - 200 from $lib/server/schemas/api/maintenance
 * @responseSchema z_maintenanceError - 404 from $lib/server/schemas/api/maintenance
 * @responseSchema z_maintenanceError - 500 from $lib/server/schemas/api/maintenance
 * @response 200 Maintenance status retrieved successfully
 * @response 404 Maintenance configuration not found
 * @response 500 Failed to retrieve maintenance status
 * @example 200 {"success": true, "isUnderMaintenance": false, "message": "All systems operational"}
 */
export async function GET() {
  return json({ success: true, isUnderMaintenance: false, message: "All systems operational" });
}
```

### Generated Output

```json
{
  "get": {
    "summary": "Get maintenance status",
    "description": "Provides maintenance status information",
    "tags": ["Maintenance"],
    "responses": {
      "200": {
        "description": "Maintenance status retrieved successfully",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "success": { "type": "boolean", "enum": [true] },
                "isUnderMaintenance": { "type": "boolean" },
                "message": { "type": "string" }
              },
              "required": ["success", "isUnderMaintenance"],
              "additionalProperties": false
            },
            "example": {
              "success": true,
              "isUnderMaintenance": false,
              "message": "All systems operational"
            }
          }
        }
      },
      "404": {
        "description": "Maintenance configuration not found",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "success": { "type": "boolean", "enum": [false] },
                "message": { "type": "string" }
              },
              "required": ["success", "message"],
              "additionalProperties": false
            },
            "example": { "success": false, "message": "Operation completed successfully" }
          }
        }
      },
      "500": {
        "description": "Failed to retrieve maintenance status",
        "content": {
          "application/json": {
            "schema": { "...": "same as 404 schema" },
            "example": { "success": false, "message": "Operation completed successfully" }
          }
        }
      }
    }
  }
}
```

---

## Schema Naming Convention

The generator uses the `z_` prefix to identify Zod schemas:

| Name Pattern     | Detected As                               |
| ---------------- | ----------------------------------------- |
| `z_contactForm`  | Request schema (used with `.safeParse()`) |
| `z_loginRequest` | Request schema                            |
| `z_*Success`     | Response schema                           |
| `z_*Error`       | Response schema                           |
| `z_*Response`    | Response schema                           |

---

## License

MIT
