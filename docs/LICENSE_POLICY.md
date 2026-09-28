# Dependency Licence Policy

## Overview

OurDAO Frontend is licensed under MIT. This document establishes a licence compatibility policy to ensure all dependencies are compatible with distributing an MIT-licensed application.

## Allowed Licences

The following licences are permitted in the dependency tree:

| Licence | Compatibility | Notes |
|---------|---------------|-------|
| MIT | ✅ Compatible | Most permissive; no restrictions |
| Apache-2.0 | ✅ Compatible | Requires patent grant notice; no copyleft |
| BSD-2-Clause | ✅ Compatible | Similar to MIT |
| BSD-3-Clause | ✅ Compatible | Adds non-endorsement clause |
| ISC | ✅ Compatible | Functionally equivalent to MIT |
| 0BSD | ✅ Compatible | Zero-clause BSD; no restrictions at all |
| BlueOak-1.0.0 | ✅ Compatible | Modern permissive licence |

## Restricted Licences

These licences require special handling:

| Licence | Restriction |
|---------|-------------|
| LGPL-2.1 | Dynamic linking only; cannot statically link into MIT app |
| LGPL-3.0 | Dynamic linking only; cannot statically link into MIT app |
| MPL-2.0 | File-level copyleft; modifications to MPL files must be shared |

## Prohibited Licences

These licences are incompatible with MIT distribution:

| Licence | Reason |
|---------|--------|
| GPL-2.0 | Strong copyleft; requires entire app to be GPL |
| GPL-3.0 | Strong copyleft; requires entire app to be GPL |
| AGPL-3.0 | Network copyleft; requires source disclosure for SaaS use |

## Enforcement

CI runs a licence check that:
1. Scans all direct and transitive dependencies
2. Compares against the allowed list above
3. Fails the build if a prohibited licence is found
4. Warns (does not fail) for restricted licences that need review

## Current Tree Audit

As of 2026-09-24, the dependency tree contains:
- **MIT**: ~95% of dependencies
- **Apache-2.0**: ~3% (notably `@stellar/stellar-sdk`)
- **BSD-2-Clause**: ~1%
- **ISC**: ~1%
- **Other permissive**: <1%

No copyleft or restrictive licences were found in the direct dependency tree.

## Attribution Requirements

Licences requiring attribution:
- **Apache-2.0**: Patent grant notice required (automatically included in binary distribution)
- **BSD-3-Clause**: Non-endorsement clause must be preserved

The MIT licence itself requires preserving the copyright notice and licence text in all copies or substantial portions of the software.

## Adding New Dependencies

Before adding a new dependency:
1. Check its licence using `npm info <package> license`
2. Verify it's in the allowed list above
3. If restricted, document why it's necessary and how it's linked
4. If prohibited, find an alternative
