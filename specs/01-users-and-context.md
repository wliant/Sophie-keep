# Users and Deployment Context

## User model

Sophie-keep serves **one household** per deployment. The household is not modeled as an entity — the entire system _is_ the household's inventory.

There are **no individual user accounts**. There is no concept of "owner", "admin", or "guest". Every person who can reach the server has equal ability to read, add, modify, and delete.

## Trust model

- **Everyone on the LAN is trusted.** This is an explicit design decision, not an oversight.
- **No authentication.** The system does not ask for a password, token, or any other credential.
- **No authorization.** Any request from any LAN client is honored.
- Concurrency between clients uses standard last-writer-wins semantics at the record level (see `07-data-and-storage.md` for the update protocol).

### Public-internet exposure

**Sophie-keep must not be exposed directly to the public internet.** The spec treats public exposure as a deployment error. The admin UI and backup files contain personal information (photos, receipts-adjacent data) that the trust model does not protect.

Implementations:

- Must **bind by default** to a private-network interface (e.g., the LAN interface or `0.0.0.0` on a router-firewalled network) and must document this.
- Must include a startup warning in logs when the configured bind address is publicly routable.
- Must not implement any port-forwarding, UPnP, or reverse-tunnel features.

### Input validation is still required

Even in a trusted environment, the system must validate input and encode output to prevent cross-site scripting (XSS) and injection attacks. A malicious script on one LAN device (or a browser extension) could otherwise be stored and run in every household member's browser. See `09-validation-and-errors.md`.

## Deployment context

- A single **home server** runs the backend and hosts the database and photo storage.
- The home server is reachable via a hostname or IP on the LAN (e.g., `http://sophie.local`).
- Clients are **modern browsers** running on household members' phones, tablets, and computers.
- No external services are contacted at runtime. (Backups are written to local disk; see `04-functional/backup-restore.md`.)

## Supported clients

| Client | Minimum support |
|---|---|
| Mobile Safari | iOS 16+ |
| Mobile Chrome | Last 2 major versions |
| Desktop Chrome, Edge, Firefox, Safari | Last 2 major versions |

The UI is responsive — see `06-ui.md` for breakpoints and interaction rules.

## Explicit non-goals for this section

- Per-user preferences, activity logs, or "who last edited" attribution. Every change is anonymous.
- Role-based access control.
- Session management.
