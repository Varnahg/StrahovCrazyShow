import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

/** Parse each fixture's chosen source independently; retain production order. */
export function readGameSource(
  filename: string | URL = new URL("../../client/game.ts", import.meta.url),
) {
  const source = ts.createSourceFile(
    "game.ts",
    readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const gameClass = source.statements.find(
    (node): node is ts.ClassDeclaration =>
      ts.isClassDeclaration(node) && node.name?.text === "Game",
  )!;
  return {
    source,
    gameClass,
    selectMembers: (names: readonly string[]) =>
      gameClass.members.filter(
        (node) => node.name && names.includes(node.name.getText(source)),
      ),
    member(name: string) {
      const result = gameClass.members.find(
        (node) => node.name?.getText(source) === name,
      );
      assert.ok(result, `Game.${name} must exist`);
      return result;
    },
  };
}
