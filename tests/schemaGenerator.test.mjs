import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationFromInfo } from "../dist/schemaGenerator.js";

const publicOptions = { authResolver: () => false };

test("does not generate a request body for a bodyless POST", () => {
  const operation = buildOperationFromInfo(
    "POST",
    { summary: "Verify payment" },
    "/payment/verify/{session_id}",
    undefined,
    undefined,
    publicOptions
  );

  assert.equal(operation.requestBody, undefined);
});

test("generates a request body from an explicit request example", () => {
  const operation = buildOperationFromInfo(
    "POST",
    { examples: { request: { email: "user@example.com" } } },
    "/contact",
    undefined,
    undefined,
    publicOptions
  );

  assert.deepEqual(operation.requestBody?.content["application/json"].example, {
    email: "user@example.com"
  });
});

test("generates a generic request body when the handler reads JSON", () => {
  const operation = buildOperationFromInfo(
    "POST",
    {},
    "/webhook",
    undefined,
    undefined,
    publicOptions,
    true
  );

  assert.deepEqual(operation.requestBody?.content["application/json"], {
    schema: { type: "object", additionalProperties: true },
    example: {}
  });
});

test("generates required parameters for dynamic route segments", () => {
  const operation = buildOperationFromInfo(
    "GET",
    {},
    "/organizations/{organization_id}/payments/{payment_id}",
    undefined,
    undefined,
    publicOptions
  );

  assert.deepEqual(operation.parameters, [
    {
      name: "organization_id",
      in: "path",
      required: true,
      schema: { type: "string" }
    },
    {
      name: "payment_id",
      in: "path",
      required: true,
      schema: { type: "string" }
    }
  ]);
});
