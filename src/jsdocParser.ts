import { parse } from "comment-parser";
import type { JsDocInfo, ResponseSchemaRef } from "./types.js";

/**
 * Find the nearest JSDoc block (/** ... * /) that ends BEFORE the given position.
 */
export function extractNearestJsDoc(fileContent: string, position: number): string {
  const endIdx = fileContent.lastIndexOf("*/", position);
  if (endIdx === -1) return "";

  const startIdx = fileContent.lastIndexOf("/**", endIdx);
  if (startIdx === -1) return "";

  return fileContent.slice(startIdx, endIdx + 2);
}

/**
 * Parse a @responseSchema tag value
 *
 * Supported formats:
 *   @responseSchema z_paymentSuccess - 200
 *   @responseSchema z_paymentError - 400
 *   @responseSchema z_paymentSuccess - 200 from $lib/server/schemas/api/payment
 */
function parseResponseSchemaTag(tagText: string): ResponseSchemaRef | null {
  // Pattern: schemaName - statusCode [from importPath]
  const match = tagText.match(/^(\w+)\s*-\s*(\d{3})(?:\s+from\s+(.+))?$/);

  if (!match) {
    console.warn(
      `Invalid @responseSchema format: "${tagText}". Expected: schemaName - statusCode [from importPath]`
    );
    return null;
  }

  return {
    schemaName: match[1],
    statusCode: match[2],
    importPath: match[3]?.trim()
  };
}

/**
 * Turn parsed JSDoc into a simple info object.
 * Supported tags:
 *   @summary Text...
 *   @response 200 Description...
 *   @example 200 {"json":"example"}   (status code or "request")
 *   @description Text...
 *   @auth true|false - Whether authentication is required
 *   @responseSchema schemaName - 200 [from $lib/server/schemas/api/payment]
 *   @hidden / @ignore - Skip this handler
 */
export function interpretJsDoc(rawBlock: string): JsDocInfo {
  if (!rawBlock) return {};

  const parsed = parse(rawBlock, { spacing: "preserve" });
  if (!parsed.length) return {};

  const b = parsed[0];
  const info: JsDocInfo = {
    summary: undefined,
    description: b.description?.trim() || undefined,
    responses: {},
    examples: {},
    responseSchemas: []
  };

  for (const tag of b.tags) {
    const tagName = tag.tag.toLowerCase();
    const tagText = (tag.name ? `${tag.name} ${tag.description}` : tag.description || "").trim();

    if (tagName === "summary") {
      info.summary = tagText || info.summary;
    } else if (tagName === "response") {
      const [status, ...rest] = tagText.split(/\s+/);
      if (status && /^\d{3}$/.test(status)) {
        info.responses![status] = rest.join(" ").trim() || info.responses![status] || "";
      }
    } else if (tagName === "example") {
      // Allow: @example 200 { ...json... }   or   @example request { ...json... }
      const spaceIdx = tagText.indexOf(" ");
      const key = (spaceIdx > 0 ? tagText.slice(0, spaceIdx) : "200").toLowerCase();
      const jsonStr = spaceIdx > 0 ? tagText.slice(spaceIdx + 1).trim() : "";
      try {
        info.examples![key] = jsonStr ? JSON.parse(jsonStr) : undefined;
      } catch {
        // ignore invalid JSON, keep undefined to fall back to defaults
      }
    } else if (tagName === "description") {
      info.description = tagText || info.description;
    } else if (tagName === "auth") {
      info.requiresAuth = tagText.toLowerCase() === "true";
    } else if (tagName === "responseschema") {
      const responseSchemaInfo = parseResponseSchemaTag(tagText);
      if (responseSchemaInfo) {
        info.responseSchemas!.push(responseSchemaInfo);
      }
    }
  }

  return info;
}
