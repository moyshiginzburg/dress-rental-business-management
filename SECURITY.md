# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`master`) | ✅ Yes |
| Older releases | ❌ No |

Always run the latest version for security fixes.

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue, please report it privately:

1. Open a [GitHub Security Advisory](../../security/advisories/new) (preferred)
2. Or email the maintainer directly (check the GitHub profile for contact info)

Please include:
- A description of the vulnerability
- Steps to reproduce it
- Potential impact
- (Optional) A suggested fix

You can expect a response within **72 hours**.

---

## Security Best Practices for Deployment

When deploying this system, make sure to:

- ✅ Set a **strong, random `JWT_SECRET`** (the `configure.sh` script does this automatically)
- ✅ Use a **strong admin password** (at least 12 characters, mixed case + numbers)
- ✅ Keep your **`APPS_SCRIPT_WEB_APP_URL` private** — it acts as an API key
- ✅ **Backup your database** regularly (the built-in cron job does this hourly)
- ✅ Keep dependencies up to date — run `npm audit` periodically
- ✅ The `local_data/` directory is excluded from Git — never commit it
