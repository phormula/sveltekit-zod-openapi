/**
 * Convert SvelteKit file paths to OpenAPI route paths
 */
export function toOpenApiRoutePath(filePath: string): string {
  // Strip src/routes prefix and SvelteKit route groups (parentheses)
  let route = filePath.replace(/^[\\/]*src[\\/]routes/, "").replace(/\+server\.(ts|js)$/, "");
  route = route.replace(/[\\/]*\([^)]+\)[\\/]*/g, "/");
  if (route === "" || route === "/") route = "/";

  // Convert SvelteKit dynamic segments [id] -> {id}
  route = route.replace(/\[([^\]]+)\]/g, (_m, p1) => `{${p1}}`);

  // Ensure leading slash, and remove trailing slash except for root
  if (!route.startsWith("/")) route = "/" + route;
  if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);

  return route;
}

/**
 * Check if a file is a SvelteKit API handler
 */
export function isApiHandler(fileName: string): boolean {
  return /\+server\.(ts|js)$/.test(fileName);
}

/**
 * Normalize path separators for cross-platform compatibility
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
