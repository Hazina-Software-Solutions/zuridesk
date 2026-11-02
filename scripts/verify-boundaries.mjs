import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["apps", "packages"];
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const ignoredDirectories = new Set([
  ".expo",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules"
]);
const databasePackageRoot = resolve(repositoryRoot, "packages/db");
const databaseModelsRoot = resolve(databasePackageRoot, "src/models");
const permittedModelConsumerRoots = [
  databaseModelsRoot,
  resolve(databasePackageRoot, "src/repositories"),
  resolve(databasePackageRoot, "src/seeds")
];
const sharedPackageRoot = resolve(repositoryRoot, "packages/shared");
const apiClientOnlyApps = [
  resolve(repositoryRoot, "apps/web"),
  resolve(repositoryRoot, "apps/mobile")
];
const databaseDrivers = new Set(["mongodb", "mongoose"]);
const nodeBuiltins = new Set(builtinModules.map((moduleName) => moduleName.replace(/^node:/u, "")));
const violations = [];

async function* sourceFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) yield* sourceFiles(path);
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) yield path;
  }
}

function importSpecifiers(source) {
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  const specifiers = new Set();

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }

  return specifiers;
}

function workspaceUnit(path) {
  const pathFromRoot = relative(repositoryRoot, path);
  const segments = pathFromRoot.split(sep);
  if ((segments[0] === "apps" || segments[0] === "packages") && segments[1]) {
    return `${segments[0]}/${segments[1]}`;
  }
  return undefined;
}

function isInside(path, parent) {
  const pathFromParent = relative(parent, path);
  return (
    pathFromParent === "" || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..")
  );
}

for (const sourceRoot of sourceRoots) {
  for await (const file of sourceFiles(resolve(repositoryRoot, sourceRoot))) {
    const source = await readFile(file, "utf8");
    const relativeFile = relative(repositoryRoot, file);

    for (const specifier of importSpecifiers(source)) {
      const topLevelPackage = specifier.split("/")[0];
      if (
        !isInside(file, databasePackageRoot) &&
        (databaseDrivers.has(topLevelPackage) || databaseDrivers.has(specifier))
      ) {
        violations.push(
          `${relativeFile}: database driver import '${specifier}' is restricted to packages/db`
        );
      }

      if (/^@zuridesk\/[^/]+\/(?:src|dist)(?:\/|$)/u.test(specifier)) {
        violations.push(
          `${relativeFile}: import '${specifier}' bypasses a package's public exports`
        );
      }

      if (isInside(file, sharedPackageRoot)) {
        const normalizedSpecifier = specifier.replace(/^node:/u, "").split("/")[0];
        if (nodeBuiltins.has(normalizedSpecifier)) {
          violations.push(
            `${relativeFile}: packages/shared must not import Node built-in '${specifier}'`
          );
        }
        if (specifier === "@zuridesk/db" || specifier.startsWith("@zuridesk/db/")) {
          violations.push(
            `${relativeFile}: packages/shared must not depend on the database package`
          );
        }
      }

      if (
        apiClientOnlyApps.some((appRoot) => isInside(file, appRoot)) &&
        (specifier === "@zuridesk/db" || specifier.startsWith("@zuridesk/db/"))
      ) {
        violations.push(
          `${relativeFile}: web and mobile must access business data through @zuridesk/api-client`
        );
      }

      if (specifier.startsWith(".")) {
        const importTarget = resolve(dirname(file), specifier);
        const sourceUnit = workspaceUnit(file);
        const targetUnit = workspaceUnit(importTarget);
        if (sourceUnit && targetUnit && sourceUnit !== targetUnit) {
          violations.push(
            `${relativeFile}: relative import '${specifier}' crosses from ${sourceUnit} into ${targetUnit}`
          );
        }

        if (
          isInside(importTarget, databaseModelsRoot) &&
          !relativeFile.endsWith(".test.ts") &&
          !relativeFile.endsWith(".integration.test.ts") &&
          !permittedModelConsumerRoots.some((root) => isInside(file, root))
        ) {
          violations.push(
            `${relativeFile}: raw database models may only be imported by database repositories, seeds, or tests`
          );
        }
      }
    }
  }
}

const databasePublicEntry = await readFile(resolve(databasePackageRoot, "src/index.ts"), "utf8");
for (const forbiddenPublicToken of [
  "getDatabaseConnection",
  "getInternalDatabase",
  "createInternalTrustedTenantContext",
  "createTrustedTenantContext",
  "bootstrapTenantIdentity",
  "userRepository",
  "mongoose"
]) {
  if (databasePublicEntry.includes(forbiddenPublicToken)) {
    violations.push(
      `packages/db/src/index.ts: public database boundary contains forbidden token '${forbiddenPublicToken}'`
    );
  }
}
for (const forbiddenPublicType of ["Connection", "Model", "Query", "Session"]) {
  if (new RegExp(`\\b${forbiddenPublicType}\\b`, "u").test(databasePublicEntry)) {
    violations.push(
      `packages/db/src/index.ts: public database boundary contains forbidden type '${forbiddenPublicType}'`
    );
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n");
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries verified.");
}
