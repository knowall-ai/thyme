# Security Policy

Timmie is a time tracking app for Microsoft Dynamics 365 Business Central, built by KnowAll AI. If you find a security problem in it, please tell us privately so we can fix it before anyone else finds it.

**Please don't open a public GitHub issue for security vulnerabilities.**

## Reporting a Vulnerability

Email [support@knowall.ai](mailto:support@knowall.ai). We read reports in English and Spanish.

Please include:

- What the vulnerability is and what an attacker could do with it
- Steps to reproduce it (requests, code or a short video are all welcome)
- The URL, page or file affected, and the browser or tool you used
- A suggested fix, if you have one

## What to Expect

- We aim to acknowledge your report within 3 working days.
- We'll confirm the issue, assess how serious it is, and keep you updated while we work on it.
- We aim to fix confirmed vulnerabilities promptly. With your permission, we'll credit you once the fix is released.

Please give us reasonable time to fix the issue before you disclose it publicly.

## Scope

In scope:

- [gettimm.ie](https://gettimm.ie) and [timmie.knowall.ai](https://timmie.knowall.ai)
- The code in this repository
- The [Timmie BC Extension](https://github.com/knowall-ai/timmie-bc-extension)

Out of scope:

- Microsoft's own services that Timmie uses, such as Business Central, Entra ID and Microsoft Graph. Please report those to the [Microsoft Security Response Center (MSRC)](https://msrc.microsoft.com/report).

## Testing Rules

If you research in good faith and follow these rules, we won't take legal action against you or ask anyone else to, and we'll treat your work as authorised.

- Only test with accounts, Business Central tenants and data that you own.
- Never access, change or keep other customers' data. If you come across any by accident, stop, don't share it, and tell us.
- No denial-of-service or volumetric testing, including load tests and heavy automated scanning.
- No social engineering (phishing, for example) of our staff or customers, and no physical attacks.

## Supported Versions

We support only the latest release, which is what runs at [gettimm.ie](https://gettimm.ie). Fixes ship in the next release. There are no maintained older versions.

## Related

Machine-readable contact details are at [`/.well-known/security.txt`](https://gettimm.ie/.well-known/security.txt).
