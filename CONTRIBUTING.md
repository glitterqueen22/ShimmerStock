# Contributing

Thank you for contributing to ShimmerStock! This guide covers how to get started, our development workflow, and quality expectations.

## Getting Started

1. Read the [Architecture](ARCHITECTURE.md) overview
2. Follow [Setup](SETUP.md) to get a development environment running
3. Review the [Branch Strategy](BRANCH_STRATEGY.md)
4. Check the [Changelog](CHANGELOG.md) for recent work

## Development Workflow

### Before You Start

- Find or create an issue describing the work
- Discuss approach with the team before building
- For large changes, write a brief design doc

### Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/my-change
   ```

2. Make your changes, following our code conventions

3. Write or update tests for your changes

4. Run the existing test suite to ensure nothing broke:
   ```bash
   bun test
   ```

5. Commit with conventional commit messages:
   ```
   feat(engine-name): clear description
   fix(engine-name): clear description
   ```

6. Push and open a Pull Request:
   ```bash
   git push -u origin feature/my-change
   ```

7. Request review and address feedback

### Code Conventions

**JavaScript/TypeScript:**
- Use ES modules (`import`/`export`)
- Prefer `const` over `let`, never `var`
- Async/await over callbacks
- JSDoc comments on public functions
- Use destructuring for function parameters

**React:**
- Functional components with hooks
- One component per file (plus related sub-components)
- Co-locate styles with components
- Use Tailwind utility classes
- Custom hooks for reusable logic

**Express Routes:**
- One route module per engine (`server/<engine>-routes.js`)
- Use middleware chain: `auth → validation → handler`
- Return consistent JSON responses
- Handle errors with try/catch and proper status codes

**Database:**
- All schema in `server/db.js` via `initDb()`
- Store functions in dedicated `*-store.js` files
- Use parameterized queries (never string interpolation)
- Add indexes for frequently queried columns

### File Organization

```
server/
  <engine>-routes.js     # API routes for the engine
  <engine>-store.js      # Database queries for the engine
  <engine>.js            # Business logic (optional, for complex engines)

client/src/
  components/<Engine>/   # Feature-specific components
  pages/<Engine>.tsx     # Page-level component
  components/ui/         # Shared design system components
```

### Pull Request Checklist

- [ ] Code follows conventions
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed
- [ ] No hardcoded secrets or credentials
- [ ] No commented-out code left behind
- [ ] PR description explains what and why
- [ ] Linked to relevant issue(s)

### Review Guidelines

When reviewing PRs, check for:
- Correctness: does it do what it says?
- Security: any exposed secrets, missing auth checks?
- Performance: any N+1 queries, unnecessary loops?
- Clarity: is the code readable and well-named?
- Completeness: error handling, edge cases, empty states?

## Reporting Bugs

Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (browser, OS, Bun version)
- Screenshots if applicable

## Feature Requests

Describe:
- The problem you're trying to solve
- How you'd like to solve it
- Alternative approaches considered
- Impact on existing workflows

## Questions?

Open a discussion or reach out to the team. We're building this together.
