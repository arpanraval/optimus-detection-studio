# Security Policy

Optimus Detection Studio is a security-focused product, and we take the
security of the project and its users seriously. We appreciate the efforts of
security researchers and the community in responsibly disclosing issues.

## Supported Versions

This project is under active development. Security fixes are applied to the
latest release on the `master` branch. Older tags are not maintained.

| Version        | Supported          |
| -------------- | ------------------ |
| Latest (`master`) | :white_check_mark: |
| Older tags     | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately using one of the following channels:

- **GitHub Security Advisories** — use the repository's
  **Security → Report a vulnerability** ("Private vulnerability reporting")
  feature. This is the preferred channel.
- **Email** — `arpan.raval07@gmail.com` with the subject line
  `SECURITY: Optimus Detection Studio`.

To help us triage quickly, please include as much of the following as you can:

- A description of the vulnerability and its impact.
- The affected component (frontend, Supabase edge function, RLS policy,
  migration, dependency, etc.) and version/commit.
- Step-by-step reproduction instructions or a proof-of-concept.
- Any suggested remediation, if you have one.

## Our Commitment

- We will acknowledge receipt of your report within **3 business days**.
- We will provide an initial assessment and expected timeline within
  **10 business days**.
- We will keep you informed of remediation progress and coordinate a
  disclosure timeline with you.
- With your permission, we are happy to credit you in the release notes once
  the issue is resolved.

## Scope

This policy covers the code in this repository, including the React/TypeScript
application, Supabase edge functions, database migrations, and Row Level
Security (RLS) policies.

Please note that a running deployment's security also depends on
operator-controlled configuration that lives **outside** this repository —
for example: Supabase project secrets and service-role keys, AI provider API
keys, integration credentials, environment variables, and CORS/allowed-origin
settings. Misconfiguration of a self-hosted deployment is the operator's
responsibility. If you believe a default in this repository leads users toward
an insecure configuration, that is in scope and we would like to hear about it.

## Please Avoid

- Denial-of-service testing against shared/hosted demo environments.
- Accessing, modifying, or destroying data that does not belong to you.
- Social engineering, phishing, or physical attacks.

Thank you for helping keep Optimus Detection Studio and its users safe.
