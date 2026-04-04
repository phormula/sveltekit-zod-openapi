import type { Plugin } from "vite";
import type { GenerateDocsOptions } from "./types.js";
import { generateDocs } from "./generateOpenApi.js";

export type SvelteKitOpenApiPluginOptions = GenerateDocsOptions & {
  /**
   * Whether to generate the OpenAPI spec when the dev server starts.
   * Defaults to `true`.
   */
  generateOnDevStart?: boolean;
  /**
   * When to regenerate the OpenAPI spec in dev mode.
   * - `"buildStart"` — generate once when the dev server starts (default)
   * - `"routeChange"` — regenerate when a `+server.ts` file changes
   */
  devMode?: "buildStart" | "routeChange";
};

/**
 * Vite plugin that auto-generates an OpenAPI spec from SvelteKit API routes.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from '@sveltejs/kit/vite';
 * import { sveltekitOpenApi } from 'sveltekit-openapi-docs/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     sveltekit(),
 *     sveltekitOpenApi({
 *       routesDir: 'src/routes/(api)',
 *       outputPath: 'static/openapi/swagger.json',
 *       title: 'My API',
 *       version: '1.0.0',
 *     }),
 *   ],
 * });
 * ```
 */
export function sveltekitOpenApi(options: SvelteKitOpenApiPluginOptions): Plugin {
  const generateOnDevStart = options.generateOnDevStart ?? true;
  const devMode = options.devMode ?? "buildStart";
  let command: "serve" | "build" = "build";

  async function generate() {
    try {
      await generateDocs(options);
    } catch (error) {
      console.error("[sveltekit-openapi-docs] Failed to generate OpenAPI spec:", error);
    }
  }

  return {
    name: "sveltekit-openapi-docs",
    enforce: "pre",

    configResolved(config) {
      command = config.command;
    },

    async buildStart() {
      if (command === "serve" && !generateOnDevStart) return;
      await generate();
    },

    async handleHotUpdate({ file }) {
      if (command !== "serve") return;
      if (devMode !== "routeChange") return;

      // Regenerate when a +server.ts/js file changes
      if (/\+server\.(ts|js)$/.test(file)) {
        console.log(`[sveltekit-openapi-docs] Route changed: ${file}`);
        await generate();
      }
    }
  };
}
