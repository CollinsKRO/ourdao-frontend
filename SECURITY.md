# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Instead, please use one of the following channels:

### Private Vulnerability Reporting (Preferred)

Use GitHub's [private vulnerability reporting](https://github.com/ourdao/ourdao-frontend/security/advisories/new) to submit findings directly and securely. This allows us to coordinate a fix before public disclosure.

> **Note:** Private vulnerability reporting is enabled for this repository. If you cannot access the reporting page, please let us know.

### Email

If GitHub's private reporting is unavailable, email security findings to: [security@ourdao.io]

**Please include:**
- A detailed description of the vulnerability
- Steps to reproduce the issue
- Potential impact and attack scenarios
- Any suggested mitigations (if applicable)

## Supported Versions

OurDAO Frontend is pre-1.0 software under active development. We maintain a single deployed version:

| Version | Branch | Supported          |
| ------- | ------ | ------------------ |
| main    | `main` | :white_check_mark: |

Security updates are applied to `main` and deployed continuously. There are no separate stable/LTS branches at this stage.

## Scope

### In Scope

The following areas are in scope for security reports:

**Frontend-specific vulnerabilities:**
- Cross-Site Scripting (XSS) that could reach `window.freighterApi` or exfiltrate member data
- Content Security Policy (CSP) bypasses
- Authentication/authorization bypasses (wallet connection, member-only actions)
- Document access control bypasses (encrypted document leaks, permission checks)
- Member address or voting history leaks
- IPFS document upload/download vulnerabilities
- Session hijacking or fixation attacks
- Client-side injection (DOM-based XSS, prototype pollution)
- Insecure cryptographic implementations (document encryption, commit-reveal)
- Dependency vulnerabilities with demonstrated exploitability

**Infrastructure & configuration:**
- HTTP security header misconfigurations
- Environment variable exposure (`PINATA_JWT` or other server-only secrets leaking to client)
- Build-time secrets in client bundles
- CORS misconfigurations enabling unauthorized cross-origin access

### Out of Scope

The following are **not** in scope for this repository:

**No-private-key boundary:**
- This frontend **never holds private keys**. All transaction signing happens inside the [Freighter browser extension](https://www.freighter.app/), in the user's own browser context. The app only receives a signed transaction XDR back, never a key.
- Reports claiming "key theft" are based on a misunderstanding of the architecture. Private keys never enter this codebase.

**Other repositories:**
- **Smart contract vulnerabilities** should be reported to [`ourdao/ourdao-contracts`](https://github.com/ourdao/ourdao-contracts/security) instead.
- **Backend/indexer vulnerabilities** should be reported to [`ourdao/ourdao-backend`](https://github.com/ourdao/ourdao-backend/security) instead.

**Third-party services:**
- Vulnerabilities in Freighter itself → report to [Freighter](https://github.com/stellar/freighter)
- Vulnerabilities in IPFS gateways (Pinata, etc.) → report to the gateway provider
- Stellar network or Soroban platform issues → report to [Stellar](https://www.stellar.org/bug-bounty-program)

**Low-severity or non-exploitable findings:**
- Theoretical attacks with no demonstrated impact
- Issues requiring physical access to the user's machine
- Social engineering attacks that do not involve a code vulnerability
- Outdated dependencies with no known exploits (we monitor these via automated tooling)

## Response Expectations

**Acknowledgment:** We aim to acknowledge receipt of your report within **48 hours**.

**Triage & Assessment:** Initial assessment (severity, scope, affected versions) within **5 business days**.

**Fix Timeline:**
- **Critical** (wallet theft, member fund loss, XSS reaching `window.freighterApi`): coordinated disclosure within **7 days** or as soon as a patch is ready.
- **High** (document access bypass, member data leak): fix within **14 days**.
- **Medium/Low**: fix in the next scheduled release, typically within **30 days**.

**Disclosure Policy:**
- We follow coordinated disclosure: we will not publicly disclose the vulnerability until a fix is deployed and you have had a chance to verify it.
- We appreciate if researchers allow us **90 days** from initial report before public disclosure, though we aim to patch much faster.
- Credit will be given to the reporter in release notes and/or a SECURITY acknowledgments section unless you prefer to remain anonymous.

## Security Measures in Place

This repository implements several security controls:

- **Content Security Policy (CSP):** Enforced via middleware with per-request nonces for `script-src`, blocking inline script injection. See `src/middleware.ts`.
- **HTTP Security Headers:** `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` — see `src/middleware.ts`.
- **No custody:** The app never holds private keys. Signing happens in Freighter.
- **Server-only secrets:** API credentials (`PINATA_JWT`) never appear in client bundles.
- **Dependency auditing:** Automated `audit-ci` runs on every PR at moderate-and-above threshold — see `.github/workflows/ci.yml` and `audit-ci.jsonc`.
- **Document encryption:** AES-GCM encryption client-side before IPFS upload — see `src/lib/ipfs.ts`.

## Related Documentation

- [README Security Notes](./README.md#security-notes) — wallet requirements, no-custody boundary, CSP details
- [Architecture Decision Records](./docs/decisions/) — design choices with security implications
- [CONTRIBUTING.md](./CONTRIBUTING.md) — secure development practices, CI checks

---

**Questions?** Open a discussion on GitHub or reach out to the maintainers.
