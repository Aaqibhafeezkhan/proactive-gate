/**
 * A validator for the subset of JSON Schema that policySchema() emits: type, enum, const, required,
 * properties, additionalProperties, items, minItems, minimum, exclusiveMinimum, maximum, pattern, oneOf
 * and local $ref. It exists so the tests can check policies without adding a dependency; it is not
 * a general validator and throws on a keyword it does not know, so a schema that grows cannot pass silently.
 */
type Schema = Record<string, unknown>;

const KNOWN = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description", "type", "enum", "const", "required", "properties",
  "additionalProperties", "items", "minItems", "minimum", "exclusiveMinimum", "maximum", "pattern", "oneOf",
]);

const kind = (value: unknown): string => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

export function validate(schema: Schema, value: unknown): string[] {
  const errors: string[] = [];
  const resolve = (ref: string): Schema => {
    if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
    let node: unknown = schema;
    for (const part of ref.slice(2).split("/")) node = (node as Schema)[part];
    return node as Schema;
  };
  const walk = (s: Schema, v: unknown, path: string): void => {
    for (const key of Object.keys(s)) if (!KNOWN.has(key)) throw new Error(`json-schema-lite does not support "${key}"`);
    if (typeof s.$ref === "string") walk({ ...resolve(s.$ref), ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== "$ref")) }, v, path);
    if (s.type !== undefined) {
      const got = kind(v);
      const ok = s.type === "number" ? got === "number" : s.type === got;
      if (!ok) return void errors.push(`${path || "/"}: expected ${String(s.type)}, got ${got}`);
    }
    if (Array.isArray(s.enum) && !s.enum.some((e) => e === v)) errors.push(`${path || "/"}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`);
    if ("const" in s && s.const !== v) errors.push(`${path || "/"}: expected ${JSON.stringify(s.const)}`);
    if (typeof v === "string" && typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) errors.push(`${path || "/"}: ${JSON.stringify(v)} does not match ${s.pattern}`);
    if (typeof v === "number") {
      if (typeof s.minimum === "number" && v < s.minimum) errors.push(`${path || "/"}: ${v} is below ${s.minimum}`);
      if (typeof s.exclusiveMinimum === "number" && v <= s.exclusiveMinimum) errors.push(`${path || "/"}: ${v} is not above ${s.exclusiveMinimum}`);
      if (typeof s.maximum === "number" && v > s.maximum) errors.push(`${path || "/"}: ${v} is above ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === "number" && v.length < s.minItems) errors.push(`${path || "/"}: needs at least ${s.minItems} items`);
      if (s.items) v.forEach((item, i) => walk(s.items as Schema, item, `${path}/${i}`));
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const props = (s.properties ?? {}) as Record<string, Schema>;
      for (const key of (s.required ?? []) as string[]) if (!(key in obj)) errors.push(`${path || "/"}: missing "${key}"`);
      for (const [key, item] of Object.entries(obj)) {
        if (key in props) walk(props[key]!, item, `${path}/${key}`);
        else if (s.additionalProperties === false) errors.push(`${path}/${key}: unknown property`);
        else if (typeof s.additionalProperties === "object" && s.additionalProperties !== null) walk(s.additionalProperties as Schema, item, `${path}/${key}`);
      }
    }
    if (Array.isArray(s.oneOf)) {
      const passing = s.oneOf.filter((alt) => {
        const before = errors.length;
        walk(alt as Schema, v, path);
        const failed = errors.length > before;
        errors.length = before;
        return !failed;
      });
      if (passing.length !== 1) errors.push(`${path || "/"}: matches ${passing.length} of ${s.oneOf.length} alternatives (needs exactly one)`);
    }
  };
  walk(schema, value, "");
  return errors;
}
