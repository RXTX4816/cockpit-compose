# Security Policy

`cockpit-compose` is a Cockpit plugin that manages Docker and Podman Compose
stacks on a user's server. Because it operates with privileged access to
container runtimes, we take security reports seriously and appreciate
responsible disclosure.

## Supported Versions

Security fixes are released for the latest published version. We recommend
always running the most recent release.

| Version | Supported          |
| ------- | ------------------ |
| Latest release | :white_check_mark: |
| Older releases | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of the private channels below:

1. **GitHub private vulnerability reporting (preferred).** Open a report via the
   repository's
   [Security tab → "Report a vulnerability"](https://github.com/RXTX4816/cockpit-compose/security/advisories/new).
   This keeps the discussion private until a fix is available.
2. **Email.** If you cannot use GitHub advisories, contact the maintainer
   through their [GitHub profile](https://github.com/RXTX4816).

Please include as much detail as possible so we can reproduce and address the
issue quickly:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Affected version(s) and environment (Cockpit version, Docker/Podman, OS)
- Any suggested remediation, if known

## Response Process

- We aim to **acknowledge your report within 5 business days**.
- We will keep you informed of our progress as we investigate and work on a fix.
- Once a fix is available, we will coordinate a disclosure timeline with you and
  credit you for the report unless you prefer to remain anonymous.

## Secret Scanning and Push Protection

This repository has **GitHub secret scanning** and **push protection** enabled.
Push protection blocks pushes that contain patterns matching known secret
formats (API keys, tokens, credentials, etc.) before they ever reach the
remote history.

If a push is blocked and you believe the detected pattern is a false positive
(e.g. test fixture data, an example credential, or a non-sensitive value),
follow GitHub's [push protection bypass
guide](https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line)
to resolve it from the command line, or use the bypass option presented in the
GitHub UI and select the reason that matches your case (test data, false
positive, etc.). Bypassed pushes are still logged for maintainers to review.

If you ever discover a secret that was committed before scanning was enabled,
please report it using the process above rather than opening a public issue.

Thank you for helping keep `cockpit-compose` and its users safe.
