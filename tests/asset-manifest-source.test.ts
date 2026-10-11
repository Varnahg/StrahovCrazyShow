import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const pairs = [
  { kind: "environment", public: "public/models/environment/manifest.json" },
  { kind: "b6", public: "public/models/b6/manifest.json" },
  { kind: "surfaces", public: "public/textures/surfaces/manifest.json" },
  { kind: "transit", public: "public/models/transit/manifest.json" },
] as const;
const finiteVector = (value: unknown) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));
function positive(value: unknown, label: string) {
  assert.equal(typeof value, "number", label);
  assert.ok(Number.isFinite(value) && (value as number) > 0, label);
}
function assetFile(url: unknown, byteLength?: number) {
  assert.equal(typeof url, "string");
  assert.match(url as string, /^\/(models|textures)\//);
  const publicRoot = path.join(root, "public"),
    file = path.resolve(publicRoot, (url as string).slice(1));
  assert.ok(
    file.startsWith(publicRoot + path.sep),
    "asset URL must stay in public",
  );
  const size = statSync(file).size;
  assert.ok(size > 0, `missing asset bytes ${url}`);
  if (byteLength !== undefined)
    assert.equal(size, byteLength, `manifest byteLength disagrees with ${url}`);
}
function collisionBoxes(asset: any) {
  assert.ok(Array.isArray(asset.collisionBoxes), `${asset.id}: collisionBoxes`);
  for (const box of asset.collisionBoxes) {
    assert.ok(
      finiteVector(box.center) &&
        finiteVector(box.dimensions) &&
        finiteVector(box.rotation),
      `${asset.id}: finite collision vectors`,
    );
    assert.ok(
      box.dimensions.every((n: number) => n > 0),
      `${asset.id}: positive collider dimensions`,
    );
  }
}
for (const pair of pairs)
  test(`${pair.kind} imported manifest is byte-identical to its public counterpart and satisfies the runtime schema`, () => {
    const source = readFileSync(
      path.join(root, "shared/data/assets", pair.kind + "-manifest.json"),
    );
    const published = readFileSync(path.join(root, pair.public));
    assert.deepEqual(
      source,
      published,
      `${pair.kind}: generated source metadata must contain the exact final public bytes`,
    );
    const manifest = JSON.parse(source.toString("utf8"));
    assert.deepEqual(manifest, JSON.parse(published.toString("utf8")));
    if (pair.kind === "environment" || pair.kind === "b6") {
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.units, "metres");
      assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
      assert.equal(
        new Set(manifest.assets.map((asset: any) => asset.id)).size,
        manifest.assets.length,
      );
      for (const asset of manifest.assets) {
        assert.equal(typeof asset.id, "string");
        assert.ok(asset.id.length > 0);
        positive(asset.triangleCount, "triangle count");
        positive(asset.byteLength, "byte length");
        assetFile(asset.url, asset.byteLength);
        collisionBoxes(asset);
      }
    } else if (pair.kind === "surfaces") {
      assert.equal(manifest.provider, "ambientCG");
      assert.equal(manifest.license, "CC0-1.0");
      assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
      assert.equal(
        new Set(manifest.assets.map((asset: any) => asset.kind)).size,
        manifest.assets.length,
      );
      for (const asset of manifest.assets) {
        positive(asset.metresPerRepeat, "physical texture repeat");
        positive(asset.metresPerRepeatV, "vertical texture repeat");
        assert.match(asset.archiveSha256, /^[a-f0-9]{64}$/);
        assert.ok(Number.isFinite(Date.parse(asset.importedAt)));
        for (const name of ["color", "normalgl", "roughness"]) {
          const channel = asset.channels[name];
          assert.ok(channel, `${asset.id}: missing ${name}`);
          positive(channel.byteLength, "texture byte length");
          assert.match(channel.sha256, /^[a-f0-9]{64}$/);
          assetFile(channel.url, channel.byteLength);
        }
      }
    } else {
      assert.equal(manifest.license, "CC0-1.0");
      assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/);
      assetFile(manifest.model);
      assetFile(manifest.lowModel);
      positive(manifest.triangles, "bus triangle count");
      positive(manifest.lowTriangles, "completed bus LOD count");
      assert.ok(manifest.lowTriangles <= manifest.triangles);
      assert.ok(
        finiteVector(manifest.bodyDimensions) &&
          manifest.bodyDimensions.every((n: number) => n > 0),
      );
      for (const wheel of [
        "WheelFrontLeft",
        "WheelFrontRight",
        "WheelRearLeft",
        "WheelRearRight",
      ])
        assert.ok(
          finiteVector(manifest.wheelCentres[wheel]),
          `${wheel}: completed wheel centres`,
        );
    }
    console.log("Source/public asset metadata", {
      kind: pair.kind,
      bytes: source.byteLength,
      sha256: createHash("sha256").update(source).digest("hex"),
    });
  });

function runtimeFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory()
      ? runtimeFiles(file)
      : /\.(?:[cm]?[jt]sx?)$/.test(entry.name)
        ? [file]
        : [];
  });
}
function importPrefix(expression: ts.Node | undefined): string | undefined {
  if (!expression) return;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text;
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return importPrefix(expression.left);
}
/** AST module edges only: asset URLs passed to fetch, Texture or URL are valid. */
function publicModuleImports(file: string, code: string) {
  const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const invalid: string[] = [],
    publicRoot = path.join(root, "public");
  const check = (expression: ts.Node | undefined) => {
    const specifier = importPrefix(expression);
    if (!specifier) return;
    const modulePath = specifier.split(/[?#]/)[0].replace(/\\/g, "/");
    if (modulePath === "/public" || modulePath.startsWith("/public/")) {
      invalid.push(specifier);
      return;
    }
    if (!/^\.{1,2}(?:\/|$)/.test(modulePath)) return;
    const resolved = path.resolve(path.dirname(file), modulePath);
    if (resolved === publicRoot || resolved.startsWith(publicRoot + path.sep))
      invalid.push(specifier);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
      check(node.moduleSpecifier);
    else if (ts.isExportDeclaration(node) && !node.isTypeOnly)
      check(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      check(node.moduleReference.expression);
    else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require")
      )
        check(node.arguments[0]);
      else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "glob" &&
        ts.isMetaProperty(callee.expression)
      ) {
        const patterns = node.arguments[0];
        if (patterns && ts.isArrayLiteralExpression(patterns))
          patterns.elements.forEach(check);
        else check(patterns);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return invalid;
}
test("runtime module graph imports metadata from source rather than the Vite public directory", () => {
  const files = ["client", "shared", "server"].flatMap((folder) =>
    runtimeFiles(path.join(root, folder)),
  );
  assert.ok(
    files.length > 40,
    "the actual runtime source graph must be scanned",
  );
  const invalid = files.flatMap((file) =>
    publicModuleImports(file, readFileSync(file, "utf8")).map((specifier) => ({
      file: path.relative(root, file),
      specifier,
    })),
  );
  assert.deepEqual(
    invalid,
    [],
    "public files are served by URL, not imported into the runtime module graph",
  );
});
test("public-import guard catches module edges while allowing public asset fetch URLs", () => {
  const file = path.join(root, "client/bootstrap-fixture.ts");
  const invalid = publicModuleImports(
    file,
    [
      "import metadata from '../public/models/example/manifest.json';",
      "export { default as meta } from '../public/models/example/manifest.json';",
      "const dynamic = import('../public/models/example/manifest.json');",
      "const pattern = import(`../public/models/${name}/manifest.json`);",
      "const commonjs = require('../public/models/example/manifest.json');",
      "const glob = import.meta.glob('../public/**/*.json');",
    ].join("\n"),
  );
  assert.equal(invalid.length, 6);
  assert.deepEqual(
    publicModuleImports(
      file,
      [
        "import metadata from '../shared/data/assets/b6-manifest.json';",
        "fetch('/models/b6/manifest.json');",
        "const texture = new Texture('/textures/surfaces/material.jpg', scene);",
        "readFile(new URL('../public' + audit.url, import.meta.url));",
        "const text = '../public/manifest.json is an explanatory string';",
      ].join("\n"),
    ),
    [],
  );
});
