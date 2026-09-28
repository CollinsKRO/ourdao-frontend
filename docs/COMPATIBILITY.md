# Compatibility Expectations

This document defines the compatibility expectations between OurDAO Frontend and its dependencies.

## Backend API Compatibility

**Target:** `ourdao-backend`

### What may change without notice
- Response fields not consumed by the frontend (extra fields are tolerated)
- Internal backend implementation details
- Non-breaking HTTP status code changes

### What requires coordination
- Removal or renaming of fields the frontend consumes
- Changes to field types (e.g., string to number)
- Breaking changes to endpoint paths or request/response structures
- Changes to authentication/authorization mechanisms

### How the frontend finds out
- CI integration tests that validate response shapes
- Version pinning in `package.json` or environment configuration

### Frontend behavior on unrecognized responses
- Extra fields in responses are silently ignored
- Missing required fields result in graceful degradation (showing default/empty states rather than crashes)
- Malformed responses trigger user-facing error messages with retry options

## Contract ABI Compatibility

**Target:** `ourdao-contracts`

### What may change without notice
- Internal contract implementation details
- Gas optimization changes that don't affect the ABI

### What requires coordination
- Changes to contract function signatures
- Changes to event definitions
- Deployment of new contract versions (new deployment = new contract ID)

### Coupling notes
Contract changes are fundamentally different from backend changes:
- A contract change means a new deployment with a new contract ID
- The frontend must be updated to reference the new contract ID
- ABI drift is currently tracked in issue #143

### How the frontend finds out
- Contract ABI is embedded in the frontend codebase
- New deployments require explicit frontend updates
- CI should eventually detect ABI drift (planned in #143)

## Version Tracking

Each frontend release records which backend and contract versions it targets: see the `Backend:` / `Contracts:` lines under each entry in [CHANGELOG.md](../CHANGELOG.md), which supersede the table below.

| Frontend Version | Backend Version | Contract ID | Notes |
|------------------|-----------------|-------------|-------|
| *Current*        | *Unversioned*   | *Pinned*    | No formal versioning yet |

## Testing Strategy

- **Backend drift:** Integration tests validate response shapes in CI
- **Contract drift:** Planned CI job to detect ABI changes (#143)
- **Runtime errors:** Frontend gracefully handles unexpected responses
