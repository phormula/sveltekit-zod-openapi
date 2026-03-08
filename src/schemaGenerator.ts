import type {
  OpenApiResponse,
  JsDocInfo,
  HttpMethod,
  OpenApiOperation,
  GenerateDocsOptions
} from "./types.js";
import { determineAuthRequirement, getSecurityRequirements } from "./authUtils.js";
import type { ZodSchemaInfo } from "./codeParser.js";
import { zodToOpenApiSchema, generateExampleFromZodSchema } from "./zodToOpenApi.js";

/**
 * Generate dynamic OpenAPI schema from example data
 */
export function generateSchemaFromExample(example: unknown) {
  if (!example || typeof example !== "object") {
    return { type: "object", additionalProperties: true };
  }

  const properties: Record<string, { type: string; items?: { type: string } }> = {};
  const exampleObj = example as Record<string, unknown>;

  for (const [key, value] of Object.entries(exampleObj)) {
    if (typeof value === "string") {
      properties[key] = { type: "string" };
    } else if (typeof value === "number") {
      properties[key] = { type: "number" };
    } else if (typeof value === "boolean") {
      properties[key] = { type: "boolean" };
    } else if (Array.isArray(value)) {
      properties[key] = { type: "array", items: { type: "object" } };
    } else if (typeof value === "object" && value !== null) {
      properties[key] = { type: "object" };
    } else {
      properties[key] = { type: "string" };
    }
  }

  return {
    type: "object",
    properties,
    additionalProperties: false
  };
}

/**
 * Build OpenAPI response object with dynamic schema and example
 */
export function buildResponse(
  statusCode: string,
  description: string,
  example: unknown
): OpenApiResponse {
  return {
    description,
    content: {
      "application/json": {
        schema: generateSchemaFromExample(example),
        example
      }
    }
  };
}

/**
 * Build standard HTTP responses with dynamic examples
 */
export function buildStandardResponses(info: JsDocInfo): Record<string, OpenApiResponse> {
  const defaultOkExample = { message: "Success" };
  const defaultErrorExample = { error: "Invalid request" };

  return {
    "200": buildResponse(
      "200",
      info.responses?.["200"] || "Successful response",
      info.examples?.["200"] || defaultOkExample
    ),
    "400": buildResponse(
      "400",
      info.responses?.["400"] || "Bad request",
      info.examples?.["400"] || defaultErrorExample
    ),
    "500": buildResponse(
      "500",
      info.responses?.["500"] || "Server error",
      info.examples?.["500"] || { error: "Internal server error" }
    )
  };
}

/**
 * Build authentication-related responses
 */
export function buildAuthResponses(info: JsDocInfo): Record<string, OpenApiResponse> {
  return {
    "401": buildResponse(
      "401",
      "Unauthorized - Invalid or missing authentication",
      info.examples?.["401"] || { error: "Unauthorized" }
    ),
    "403": buildResponse(
      "403",
      "Forbidden - Invalid API Key",
      info.examples?.["403"] || { error: "Forbidden: Invalid API Key" }
    )
  };
}

/**
 * Build responses for additional status codes found in examples
 */
export function buildAdditionalResponses(info: JsDocInfo): Record<string, OpenApiResponse> {
  const responses: Record<string, OpenApiResponse> = {};

  for (const [statusCode, example] of Object.entries(info.examples || {})) {
    if (statusCode !== "request" && !["200", "400", "500", "401", "403"].includes(statusCode)) {
      const description = info.responses?.[statusCode] || getStatusDescription(statusCode);
      responses[statusCode] = buildResponse(statusCode, description, example);
    }
  }

  return responses;
}

/**
 * Get standard HTTP status descriptions
 */
export function getStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    "200": "OK",
    "201": "Created",
    "204": "No Content",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "409": "Conflict",
    "422": "Unprocessable Entity",
    "500": "Internal Server Error"
  };

  return descriptions[statusCode] || `HTTP ${statusCode}`;
}

/**
 * Build complete OpenAPI operation from JSDoc info and extracted examples
 */
export function buildOperationFromInfo(
  httpMethod: HttpMethod,
  info: JsDocInfo,
  routePath?: string,
  zodSchemaInfo?: ZodSchemaInfo,
  zodResponseSchemas?: ZodSchemaInfo[],
  options?: GenerateDocsOptions
): OpenApiOperation {
  const wantsBody = httpMethod === "POST" || httpMethod === "PUT" || httpMethod === "PATCH";

  let standardResponses = buildStandardResponses(info);

  if (zodResponseSchemas && zodResponseSchemas.length > 0) {
    standardResponses = buildResponsesFromZodSchemas(
      zodResponseSchemas,
      standardResponses,
      info.examples,
      info.responses
    );
  }

  const requiresAuth = determineAuthRequirement(httpMethod, routePath, info, options?.authResolver);
  const authResponses = requiresAuth ? buildAuthResponses(info) : {};
  const additionalResponses = buildAdditionalResponses(info);

  const allResponses = {
    ...standardResponses,
    ...authResponses,
    ...additionalResponses
  };

  const operation: OpenApiOperation = {
    summary: info.summary || `Handler for ${httpMethod} request`,
    description: info.description,
    responses: allResponses
  };

  if (requiresAuth) {
    operation.security = getSecurityRequirements(options?.securitySchemes);
  }

  if (wantsBody) {
    if (zodSchemaInfo) {
      operation.requestBody = buildRequestBodyFromZodSchema(zodSchemaInfo);
    } else {
      const requestExample = info.examples?.["request"] || { key: "value" };
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: generateSchemaFromExample(requestExample),
            example: requestExample
          }
        }
      };
    }
  }

  return operation;
}

/**
 * Build responses using Zod response schemas.
 * If jsdocExamples is provided, those examples override Zod-generated ones
 * for matching status codes.
 * If jsdocResponses is provided, those descriptions override auto-generated ones.
 */
function buildResponsesFromZodSchemas(
  zodResponseSchemas: ZodSchemaInfo[],
  defaultResponses: Record<string, OpenApiResponse>,
  jsdocExamples?: Record<string, unknown>,
  jsdocResponses?: Record<string, string>
): Record<string, OpenApiResponse> {
  const enhancedResponses = { ...defaultResponses };

  for (const schema of zodResponseSchemas) {
    const { schemaName } = schema;

    let statusCode = "200";
    let example: unknown;
    let description = "Default description";

    if (schema.schema) {
      const openApiSchema = zodToOpenApiSchema(schema.schema);
      example = generateExampleFromZodSchema(schema.schema);

      if (schema.statusCode) {
        statusCode = schema.statusCode;
        description = jsdocResponses?.[statusCode] || getStatusDescription(statusCode);
        if (!jsdocResponses?.[statusCode]) {
          if (schemaName.includes("Error")) {
            description = schemaName.includes("NotFound")
              ? "Not found"
              : schemaName.includes("Validation")
                ? "Validation error"
                : "Error response";
          } else if (schemaName.includes("Success")) {
            description = "Successful response";
          }
        }
      } else if (schemaName.includes("Error")) {
        if (schemaName.includes("NotFound")) {
          statusCode = "404";
          description = "Not found";
        } else if (schemaName.includes("Validation")) {
          statusCode = "400";
          description = "Validation error";
        } else {
          statusCode = "400";
          description = "Error response";
        }
      } else if (schemaName.includes("Success")) {
        statusCode = "200";
        description = "Successful response";
      }

      // Apply @example JSDoc override if available
      if (jsdocExamples && jsdocExamples[statusCode] !== undefined) {
        example = jsdocExamples[statusCode];
      }

      enhancedResponses[statusCode] = {
        description,
        content: {
          "application/json": {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: openApiSchema as any,
            example
          }
        }
      };
      continue;
    }

    // Fallback: Schema wasn't loaded
    console.warn(`Zod schema ${schemaName} was not loaded. Using generic example.`);

    if (schema.statusCode) {
      statusCode = schema.statusCode;
      description = jsdocResponses?.[statusCode] || getStatusDescription(statusCode);
      if (statusCode.startsWith("2")) {
        example = { success: true, message: "Operation completed successfully" };
      } else if (statusCode.startsWith("4")) {
        example = { success: false, message: "An error occurred" };
      } else {
        example = { data: "example_value" };
      }
    } else if (schemaName.includes("Error")) {
      if (schemaName.includes("NotFound")) {
        statusCode = "404";
        description = "Not found";
      } else if (schemaName.includes("Validation")) {
        statusCode = "400";
        description = "Validation error";
      } else {
        statusCode = "400";
        description = "Error response";
      }
      example = { success: false, message: "An error occurred" };
    } else if (schemaName.includes("Success")) {
      statusCode = "200";
      description = "Successful response";
      example = { success: true, message: "Operation completed successfully" };
    } else {
      statusCode = "200";
      description = "Response";
      example = { data: "example_value" };
    }

    if (jsdocExamples && jsdocExamples[statusCode] !== undefined) {
      example = jsdocExamples[statusCode];
    }

    enhancedResponses[statusCode] = buildResponse(statusCode, description, example);
  }

  return enhancedResponses;
}

/**
 * Build request body schema from Zod schema information using actual Zod schema
 */
function buildRequestBodyFromZodSchema(zodSchemaInfo: ZodSchemaInfo) {
  try {
    if (zodSchemaInfo.schema) {
      const schema = zodToOpenApiSchema(zodSchemaInfo.schema);
      const example = generateExampleFromZodSchema(zodSchemaInfo.schema);

      return {
        required: true,
        content: {
          "application/json": {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: schema as any,
            example
          }
        }
      };
    }

    console.warn(`Zod schema ${zodSchemaInfo.schemaName} was not loaded. Using generic example.`);

    return {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: { type: "string", description: "Request data" }
            },
            additionalProperties: true
          },
          example: { data: "example_value" }
        }
      }
    };
  } catch (error) {
    console.warn("Error building request body from Zod schema:", error);
    return {
      required: true,
      content: {
        "application/json": {
          schema: { type: "object", additionalProperties: true },
          example: { data: "example_value" }
        }
      }
    };
  }
}
