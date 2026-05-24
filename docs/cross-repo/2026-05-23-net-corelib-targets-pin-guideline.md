# Guideline — Pin the `@idevs/corelib` npm range in `Idevs.Net.CoreLib.targets`

> **Audience:** maintainer of `Idevs.Net.CoreLib` (Sarawut). This is a guideline you implement in the `.NET` repo when you have time — it's not on the `@idevs/corelib` 1.1.0 task list. Target release: **`Idevs.Net.CoreLib` 0.7.10** (patch bump).
>
> **Why now:** `@idevs/corelib` 1.1.0 is non-breaking, so the unpinned `npm install @idevs/corelib` in `.targets` is still safe today. It stops being safe the day **`@idevs/corelib` 2.0.0** ships (Serenity 10 lane). This guideline fixes the pinning ahead of that, so no `Idevs.Net.CoreLib 0.7.x` consumer accidentally pulls a 2.x client.

---

## Background

`src/Idevs.Net.CoreLib/build/Idevs.Net.CoreLib.targets` runs `npm install @idevs/corelib --no-save` on first build to provision client-side assets for the consumer project. The current command has **no version specifier**, so npm resolves to the `latest` dist-tag.

That works while `latest = 1.0.5` (or any 1.x). It breaks the moment `latest` advances to `2.0.0`, which targets Serenity 10 and is **incompatible** with consumers still on `Idevs.Net.CoreLib 0.7.x` (net8 + Serenity 8.8.9).

The marker-file check (`Exists($(ProjectDir)node_modules/@idevs/corelib/dist/index.d.ts)`) protects developer machines on subsequent builds — but **CI environments and fresh clones always start with no `node_modules`**, so they always run the unpinned install. CI is the failure surface.

Compatibility matrix (see `@idevs/corelib`'s `MIGRATION.md` and `README.md`):

| `Idevs.Net.CoreLib` | .NET TFM | `Serenity.Net.Services` | Expected `@idevs/corelib` |
|---|---|---|---|
| `0.7.x` | `net8.0` | `8.8.9` | `>=1.0.0 <2.0.0` |
| `0.8+` (planned) | `net10.0` | `10.x` | `>=2.0.0 <3.0.0` |

The `.targets` install command should mirror the row matching its own version.

---

## Change

### File: `src/Idevs.Net.CoreLib/build/Idevs.Net.CoreLib.targets`

Locate the `NpmInstall` target's `<Exec>` line:

```xml
<Exec Command="npm install @idevs/corelib --no-save"
      WorkingDirectory="$(ProjectDir)" />
```

Replace with:

```xml
<!--
  Pin to the major matching this Idevs.Net.CoreLib version.
  0.7.x → @idevs/corelib 1.x (Serenity 8.8.9 lane, net8).
  When this package bumps to 0.8.x (Serenity 10 / net10 lane), update the
  range to ">=2.0.0 <3.0.0".
  See: https://github.com/klomkling/idevs.corelib/blob/main/MIGRATION.md
-->
<Exec Command="npm install &quot;@idevs/corelib@&gt;=1.0.0 &lt;2.0.0&quot; --no-save"
      WorkingDirectory="$(ProjectDir)" />
```

**Why the explicit `>=1.0.0 <2.0.0` form instead of `^1.0.0`:**
- MSBuild rendering of the command in build output is unambiguous (no shell-quoting surprises around the `^`).
- Reader of the `.targets` file sees the intent (major-pin) without remembering npm semver shorthand.
- The XML-entity escaping (`&gt;` / `&lt;`) is required because raw `>` and `<` would terminate the XML element.

**Resolved shell command** (what npm actually sees):
```
npm install "@idevs/corelib@>=1.0.0 <2.0.0" --no-save
```

(The outer double-quotes are necessary because the range string contains a space.)

---

## Optional improvement (defer if low priority)

### Skip the CSS copy when destination is up-to-date

The `CopyContentToProject` target currently runs `BeforeTargets="Build"` unconditionally, re-copying `@idevs/corelib/css/*.css` to `wwwroot/lib/Idevs/Content/` on every build. With the current tiny CSS catalog this is negligible. If the catalog grows, add MSBuild's UpToDate inputs/outputs metadata so the target is skipped when sources haven't changed:

```xml
<Target Name="CopyContentToProject"
        BeforeTargets="Build"
        Condition="Exists('$(ProjectDir)node_modules/@idevs/corelib/css')"
        Inputs="@(ContentFiles)"
        Outputs="@(ContentFiles->'$(ProjectDir)wwwroot/lib/Idevs/Content/%(Filename)%(Extension)')">
    <Message Text="Copying @idevs/corelib content to wwwroot" Importance="normal" />
    <ItemGroup>
        <ContentFiles Include="$(ProjectDir)node_modules/@idevs/corelib/css/*.css" />
    </ItemGroup>
    <Copy SourceFiles="@(ContentFiles)"
          DestinationFolder="$(ProjectDir)wwwroot/lib/Idevs/Content/" />
</Target>
```

Skip this optional fix if the CSS folder will remain small (<10 files) for the foreseeable future.

---

## Version bump and changelog

### `src/Idevs.Net.CoreLib/Idevs.Net.CoreLib.csproj`

```xml
<Version>0.7.10</Version>
```

### `CHANGELOG.md`

Insert at the top of the changelog body, before the `0.7.9` entry:

```markdown
## 0.7.10 (yyyy-mm-dd)

### Changed
- **`Idevs.Net.CoreLib.targets`** — `npm install @idevs/corelib` now pins the range
  to `>=1.0.0 <2.0.0`. Previously the install resolved to the `latest` npm
  dist-tag, which would have pulled `@idevs/corelib 2.x` (Serenity 10 lane)
  the moment it shipped, breaking CI on net8 / Serenity 8.8.9 consumers.
  The pin guarantees 0.7.x consumers stay on the matching client major.

### Notes
- No code changes. Patch-level, fully backwards-compatible.
- When this package advances to `0.8.x` for the .NET 10 / Serenity 10 lane,
  update the pin to `>=2.0.0 <3.0.0` in lockstep with `@idevs/corelib 2.0`.
```

---

## Verification

After making the change, before tagging:

- [ ] **Local build pulls the pinned version.**
  ```bash
  cd /tmp && mkdir test-pin && cd test-pin
  dotnet new web
  # Reference the locally-packed nupkg with the change applied.
  dotnet add package Idevs.Net.CoreLib --source /Users/sarawut/GitHub/Idevs/single-repo/Idevs.Net.CoreLib/artifacts
  dotnet build
  cat node_modules/@idevs/corelib/package.json | grep '"version"'
  # Expect: "version": "1.x.y"  (current 1.x latest, e.g., "1.0.5")
  ```

- [ ] **CI smoke (manual or via PR):** the existing `ci.yml` build-test job should still pass; no new test is needed because the change is in MSBuild logic, not C#.

- [ ] **Forward-compat check:** publish a `@idevs/corelib@2.0.0-rc.0` to npm under the `next` dist-tag (or a private registry) and confirm a fresh `dotnet build` of a `Idevs.Net.CoreLib 0.7.10` reference still pulls `1.x` rather than `2.0.0-rc.0`. (Optional — only do this if a 2.0 pre-release exists at the time.)

- [ ] Tag, push, let `release.yml` publish to NuGet, GitHub Release auto-generates.

---

## When `Idevs.Net.CoreLib` 0.8 ships (future)

When the .NET package jumps to the net10 / Serenity 10 lane (`Idevs.Net.CoreLib 0.8.x`), repeat this same pattern with the next major:

```xml
<Exec Command="npm install &quot;@idevs/corelib@&gt;=2.0.0 &lt;3.0.0&quot; --no-save"
      WorkingDirectory="$(ProjectDir)" />
```

Pair with the publish of `@idevs/corelib 2.0.0`. Coordinate the two releases (publish the npm package first, then publish the NuGet package whose `.targets` references it) so consumers never land in a window where the .NET package asks for an npm version that doesn't yet exist.

---

## Related

- `@idevs/corelib` 1.1.0 plan: `docs/superpowers/plans/2026-05-23-corelib-1-1-0-update.md`
- `@idevs/corelib` `MIGRATION.md` (created in 1.1.0): documents the compatibility matrix consumer-side.
