# Releasing `youwee-sdk`

This document defines the release and compatibility policy for `youwee-sdk`.

## Scope

`youwee-sdk` is versioned independently as a package, but it is developed inside the main Youwee repository.

For now, this is intentional:

- the SDK contract still evolves together with the application runtime
- plugin scaffold generation depends on the exact bundled SDK artifact
- backend compatibility enforcement and frontend plugin UX must stay aligned

The SDK may be moved to a separate repository later, but only after the execution contract and packaging model are considered stable.

## Source of Truth

The canonical source of the SDK is:

- `sdk-js/src/`

The published or vendored runtime artifact is:

- `sdk-js/dist/`

Do not edit `dist/` by hand. Rebuild it from the TypeScript source before release or vendoring changes.

## Release Checklist

1. Update `sdk-js/package.json` version.
2. Update `sdk-js/CHANGELOG.md`.
3. Rebuild the SDK:
   - `bunx tsc -p sdk-js/tsconfig.json`
4. Run repository checks:
   - `bun run biome check --write .`
   - `bun run tsc -b`
   - `cargo check` in `src-tauri/`
5. Verify plugin scaffold vendoring still includes every required SDK runtime file.
6. Verify backend compatibility enforcement still matches the SDK compatibility helpers.
7. Pack and publish from the `sdk-js/` directory, not from the repository root:
   - `cd sdk-js`
   - `bun pm pack --destination /tmp/youwee-sdk-pack`
   - `bun publish --dry-run`

## Versioning Policy

Use semantic versioning for the SDK package:

- patch: documentation updates, internal refactors, additive typing improvements, bug fixes
- minor: additive runtime APIs, additive trigger helpers, additive manifest helpers
- major: breaking runtime contract changes, breaking plugin module changes, breaking manifest changes, breaking compatibility policy changes

## Compatibility Contract

Two compatibility layers matter:

1. `manifest.compatibility.appVersion`
2. `manifest.compatibility.sdkVersion`

Recommended rules:

- bump `appVersion` constraints when the plugin depends on new Youwee runtime capabilities
- bump `sdkVersion` constraints when the plugin depends on new SDK helpers or changed SDK behavior
- prefer bounded ranges like `>=1.0.0 <2.0.0`

The backend should reject execution and installation when a declared range is incompatible with the current app or bundled SDK.

## Publishing Notes

When the package is eventually published externally:

- keep the package name `youwee-sdk`
- publish only built artifacts and package docs
- ensure `README.md`, `CHANGELOG.md`, and `RELEASING.md` remain included in the package
- keep CommonJS output unless the runtime policy formally adopts dual CJS/ESM support
- run packaging commands inside `sdk-js/` so Bun targets the SDK package instead of the app workspace root
