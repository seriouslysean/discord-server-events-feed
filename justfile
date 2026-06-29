# Run `just` (or `just --list`) to see every task.
# Recipes delegate to npm scripts so package.json stays the single source of truth.

# List available recipes
default:
    @just --list

# Install dependencies reproducibly from the lockfile
install:
    npm ci

# Lint with oxlint
lint:
    npm run lint

# Format every file in place with oxfmt
format:
    npm run format

# Check formatting without writing (what CI runs)
format-check:
    npm run format:check

# Type-check with tsc (no emit)
typecheck:
    npm run type-check

# Run the test suite
test:
    npm test

# Run every check CI runs: lint, formatting, types, tests
check: lint format-check typecheck test

# Generate the ICS feed locally (loads .env if present)
generate:
    npm start
