# Security model

Decision Workbench is a single-operator localhost alpha. It is not designed for public Internet exposure or mutually untrusted users.

The CLI binds loopback. API calls require an operator token of at least 24 characters, checked with a constant-time comparison; the server also checks Host and browser Origin. Static assets use a restrictive content security policy. Tokens grant full workspace access. The browser receives its token through a URL fragment, removes that fragment and keeps the token in session storage. Protect the terminal and browser session.

The TypeSafe key remains server-side. Extracted fields and model inputs are sent to TypeSafe when using real inference. Local imports and synthetic inference do not call TypeSafe. Action plugins may make external writes after approval, including in demo mode. The optional webhook restricts its destination to server configuration and does not follow redirects.

Plugins are trusted local programs, not sandboxed uploads. They inherit process environment and filesystem/network access. Hash approval covers the entrypoint file only. Review their code and dependencies before installation. The heap limit and timeout reduce accidental resource consumption but do not create a hostile-code security boundary.

SQLite stores data in plaintext. Workspace directory permissions, backups, disk encryption and retention belong to the operator. Exported packs, run records and traces can contain sensitive business data. Never include them in a public issue. The audit log is not tamper-proof.

Report a suspected vulnerability using GitHub's private vulnerability reporting if enabled for this repository. Do not post secrets or exploitation details in a public issue. This alpha has no guaranteed response SLA. Dependency advisories and security controls must be reassessed before production deployment.
