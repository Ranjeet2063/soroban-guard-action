## Description
<!-- Provide a clear and concise description of the security check or rule addition. -->

## Changes Made
- [ ] Static analysis rules updated
- [ ] TypeScript types and compilation validated
- [ ] Bundled `dist/index.js` synchronized via `pnpm build`

## Verification
- [ ] `pnpm test` passes 100% green
- [ ] `pnpm typecheck` passes with 0 diagnostic errors
- [ ] `git diff --exit-code dist/index.js` confirms distribution binary in sync
