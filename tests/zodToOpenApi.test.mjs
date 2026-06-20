import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { generateExampleFromZodSchema } from "../dist/zodToOpenApi.js";

test("generates semantic examples that satisfy their schemas", () => {
  const schema = z.object({
    session_id: z.string(),
    email: z.email(),
    phone: z.string().regex(/^\+233\d{9}$/),
    price: z.number().int().min(0),
    discount: z.number().int().min(0).max(100),
    referralCode: z.string().min(1),
    access_code: z.string().min(1),
    tenant_client_key: z.string().min(1),
    success: z.boolean()
  });

  const example = generateExampleFromZodSchema(schema);
  assert.equal(schema.safeParse(example).success, true);
  assert.match(example.session_id, /^session_/);
  assert.match(example.email, /@/);
  assert.equal(example.phone, "+233201234567");
  assert.equal(Number.isInteger(example.price), true);
  assert.match(example.referralCode, /^REF/);
  assert.match(example.access_code, /^access_/);
  assert.match(example.tenant_client_key, /^client_/);
  assert.equal(example.success, true);
});

test("rejects a semantic candidate that violates the field schema", () => {
  const schema = z.object({
    phone: z.string().regex(/^020\d{7}$/)
  });

  const example = generateExampleFromZodSchema(schema);
  assert.equal(schema.safeParse(example).success, true);
  assert.notEqual(example.phone, "+233201234567");
});

test("keeps explicit describe examples as the highest priority", () => {
  const field = z.string().describe("example:MY-EXPLICIT-CODE");
  assert.equal(generateExampleFromZodSchema(field, "code"), "MY-EXPLICIT-CODE");
});
