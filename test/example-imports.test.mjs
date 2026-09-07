import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const exportsMap = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).exports;

/** The declaration file a subpath resolves to, straight from the exports map rather than guessed. */
function typesFor(specifier) {
  const subpath = specifier === "proactive-gate" ? "." : `.${specifier.slice("proactive-gate".length)}`;
  const entry = exportsMap[subpath];
  assert.ok(entry?.types, `package.json exports has no types entry for "${subpath}"`);
  return entry.types.replace(/^\.\//, "");
}

/**
 * The four TypeScript files in examples/ are illustrative: they import @langchain/langgraph,
 * @mastra/core and the AI SDK, none of which is a dependency here, so they are neither compiled
 * nor executed. examples/ai-sdk/run.mjs and examples/mastra/run.mjs are the executed ones, and
 * test/examples.test.mjs runs both.
 *
 * That leaves one way for a published snippet to rot on our side: rename or remove an export and
 * the illustrative files keep telling readers to import a symbol that no longer exists. This test
 * closes exactly that gap and no more. It cannot tell you a framework changed its own API — only
 * installing that framework could, and installing four agent frameworks to type-check four
 * snippets is a worse trade than saying plainly which files are executed.
 */
const examplesDir = fileURLToPath(new URL("../examples/", import.meta.url));
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".ts"));

test("the examples import at least one TypeScript file worth checking", () => {
  assert.ok(files.length > 0, "no examples/*.ts found; delete this test or restore the files");
});

for (const file of files) {
  test(`${file} imports only symbols proactive-gate still exports`, async () => {
    const source = readFileSync(examplesDir + file, "utf8");
    // Named imports from the package itself or one of its subpaths. Type-only imports count:
    // a reader pastes them and they have to resolve too.
    const pattern = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](proactive-gate(?:\/[\w-]+)?)["']/g;
    const seen = [];

    for (const [, names, specifier] of source.matchAll(pattern)) {
      const mod = await import(specifier);
      // Types are erased at build time, so an interface never appears in the runtime namespace.
      // The declarations beside the module are the only place to look for those, and looking
      // there catches a removed type as well as a removed function.
      const declarations = readFileSync(new URL(`../${typesFor(specifier)}`, import.meta.url), "utf8");

      for (const raw of names.split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        seen.push(`${specifier}:${name}`);
        const declared =
          name in mod ||
          new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:type|interface|class|function|const)\\s+${name}\\b`).test(declarations) ||
          new RegExp(`export\\s+type\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, "s").test(declarations);
        assert.ok(
          declared,
          `${file} imports { ${name} } from "${specifier}", which exports neither a value nor a ` +
            `type by that name. Values available: ${Object.keys(mod).sort().join(", ")}`,
        );
      }
    }

    // A file whose imports stopped matching the pattern would pass silently while checking
    // nothing, which is the failure this whole test exists to prevent.
    assert.ok(
      seen.length > 0,
      `${file} matched no named import from proactive-gate. Either the example stopped using the ` +
        "package, or the pattern in this test no longer recognises how it imports it.",
    );
  });
}
