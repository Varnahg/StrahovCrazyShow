// KEY-44 recovery pilot: intentionally incomplete RED checkpoint.
// The next agent must implement the committed-HEAD contract without weakening
// tests/lfs-assets.test.ts. This stub must never report assets as ready.
console.error(
  "LFS asset preflight is not implemented (KEY-44 RED recovery checkpoint); asset readiness was not checked.",
);
process.exitCode = 2;
