# Feature Module Pattern: demo

This folder demonstrates the standard feature module structure.
Copy this folder as a starting point for new feature modules.

## Structure

```
src/features/<module>/
  types.ts              — Module-specific TypeScript types
  hooks/                — Custom hooks (data fetching, state)
    use<Module>Data.ts
  components/           — Module-specific UI components
    <Module>Table.tsx
  pages/                — Route-level page components
    <Module>ListPage.tsx
```

## Conventions

- Pages are wired into `src/routes/router.tsx` under the ShellLayout.
- Reusable UI (DataTable, Modal, PageHeader, etc.) lives in `src/components/`.
- Feature-specific components stay inside the feature folder.
- Hooks manage data; pages compose hooks + components.
