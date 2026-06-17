# Security Policy

## Supported versions

madside is a solo project under active development and ships from `main`. Only
the latest release and the current `main` are supported — there are no
backported security fixes for older tags.

| Version        | Supported |
| -------------- | --------- |
| `main` / latest | ✅        |
| older tags     | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:
[**Report a vulnerability**](https://github.com/mikolajmikolajczyk/madside/security/advisories/new).

If you can't use GitHub advisories, email **mikolajczyk.mikolajm@gmail.com**
with `madside security` in the subject.

Please include:

- what you found and where (file / URL / component),
- steps to reproduce or a proof of concept,
- the impact you think it has.

### What to expect

- Acknowledgement within a few days (best effort — solo maintainer).
- A fix or mitigation on `main` once confirmed, credited to you if you'd like.

## Scope notes

madside is a fully client-side web IDE — there is no backend, no user accounts,
and no server-side data. Projects live in the browser's IndexedDB. The most
relevant attack surface is **untrusted content**: courses and project-local
plugins (`converters/*.js`, editor plugins) are fetched from third-party GitHub
repos and run in the user's browser. Findings around plugin/course sandboxing,
the Content-Security-Policy (`static-web-server.toml`), or supply-chain issues
in dependencies are in scope and welcome.
