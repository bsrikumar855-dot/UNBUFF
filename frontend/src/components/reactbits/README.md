# React Bits components

Installed with `npx shadcn@latest add @react-bits/<Name>-TS-TW` from https://reactbits.dev (MIT + Commons Clause: free to use inside an app, not to resell the components). Kept close to upstream so they can be re-added to update. Differences from upstream:

- Moved here from `src/components/`.
- `GlassSurface.tsx`, `BlurText.tsx`, `HalftoneReveal.tsx`, `PillNav.tsx` and `MicroSlats.tsx` carry `@ts-nocheck` because they are written without this project's `noUncheckedIndexedAccess`.
- `BlurText.tsx` has a few `!` assertions and one lint-disable for its opt-in click replay.

Note: the shadcn installer downgraded `motion` in package.json while adding BlurText; that change was reverted. Check `git diff package.json` after any future install.

- `MicroSlats.tsx` needs the `ogl` WebGL library (a normal dependency).
