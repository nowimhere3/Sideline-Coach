# SIDELINE COACH — REMOTE ACCESS V1 PRE-ARCHITECT SCOUT REPORT
## IDENTITY, GITHUB TRIPLE-ROLE, COACH SOURCE & PERMISSION ESCALATION

**Agent:** Anti-Gravity  
**Game Root:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Mode:** Read-Only Reconnaissance  
**Target:** Pre-Architect Identity, GitHub Roles, Coach Source & Capability Architecture  
**Date:** 2026-09-23  

---

# EXECUTIVE VERDICT: THE ROLE OF GITHUB IN SIDELINE

GitHub is extraordinarily well-suited for Sideline Coach because it can uniquely satisfy **three distinct roles**:
1. **Human Identity:** High-trust, low-friction developer authentication.
2. **Coach Source Locator:** A canonical, internet-resolvable address for project documentation and source files when an Assistant Coach runs remotely.
3. **Developer Action Engine:** Native git workflow integration (status, branch, commit, push, PR).

However, **GitHub must not be hardcoded as the singular, universal Sideline user identity key.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             ROLE CLASSIFICATION                             │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ DEFAULT       │ GitHub OAuth is the default first-run "one-click"           │
│               │ authentication path for developer users.                    │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ REQUIRED      │ NOTHING. GitHub is NOT strictly required to have a Sideline │
│               │ account or to use local Sideline features.                  │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ OPTIONAL      │ Connecting repository permissions, linking GitHub as a      │
│               │ Coach Source, or using Git push/commit features.            │
├───────────────┼─────────────────────────────────────────────────────────────┤
│ FUTURE        │ Alternative identities (Email magic-link, Passkey, Google)  │
│               │ and alternative Coach Sources (Google Drive, Cloud Sync).   │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

---

# SIDELINE USER MODEL (MINIMAL DURABLE ABSTRACTION)

To avoid painting Sideline into a vendor lock-in corner while keeping the MVP lightweight, the user model must separate the **internal Sideline Subject** from **attached Identity Providers**:

```
┌─────────────────────────────────────────────────────────┐
│                      SidelineUser                       │
│  • sidelineUserId: "usr_01J8X..." (ULID/UUID)           │
│  • createdAt: 1727092800000                             │
│  • primaryEmail: "david@example.com"                    │
│  • emailVerified: true                                  │
│  • marketingConsent: { optIn: false, ... }              │
└────────────────────────────┬────────────────────────────┘
                             │ 1 : N (Links)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     LinkedIdentity                      │
│  • provider: "github" | "google" | "email_otp"          │
│  • providerSubjectId: "12345678" (Immutable numeric ID) │
│  • providerUsername: "dmcal"                            │
│  • profileData: { displayName, avatarUrl }              │
│  • linkedAt: 1727092800000                              │
│  • scopesGranted: ["read:user", "user:email"]           │
└─────────────────────────────────────────────────────────┘
```

### Invariants:
1. **Internal Primary Key:** Internal database tables, host pairings, and telemetry reference `sidelineUserId`, **never** raw GitHub usernames or provider IDs.
2. **Provider Multiplicity:** A single `sidelineUserId` can have a GitHub identity linked today, and an email/passkey identity linked tomorrow.
3. **Username Mutability:** GitHub usernames can change; GitHub numeric `id` (`providerSubjectId`) is immutable.

---

# GITHUB CAPABILITY MODEL (THE TRIPLE ROLE DECOUPLING)

The architecture must strictly segregate GitHub capabilities into distinct operational layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. HUMAN IDENTITY (Authentication)                                          │
│    "Who is Dad?"                                                            │
│    • Minimal OAuth scope: read:user or user:email.                          │
│    • Zero repository permissions requested or granted.                     │
│    • Used to authorize phone browser sessions against desktop hosts.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. ACCOUNT LINKAGE (Profile & Preferences)                                  │
│    "Connecting GitHub metadata to Sideline"                                 │
│    • Links providerSubjectId to sidelineUserId.                             │
│    • Resolves avatar, public handle, and primary email.                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. COACH SOURCE (Repository Locator for Remote Assistant Coach)             │
│    "Where are the project files when Dad is on his phone?"                  │
│    • Resolves github.com/user/repo • branch main • docs/*.                  │
│    • Public repos require zero tokens.                                      │
│    • Private repos use scoped read-only installation tokens or host bridge. │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. LOCAL GIT (Developer Actions via Desktop CLI)                            │
│    "Commit, branch, push, status"                                           │
│    • Executed locally via desktop git CLI.                                  │
│    • Uses developer's existing local SSH keys and credential managers.       │
│    • ZERO GitHub API tokens or OAuth repo scopes required.                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. GITHUB API (Cloud/Remote Webhook & Metadata Actions)                     │
│    "PR creation, GitHub Actions status, issue linking"                      │
│    • Requires explicit secondary permission escalation via GitHub App.      │
│    • Scoped strictly to designated repositories.                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# COACH REFRESH SOURCE MODEL (LOCAL ROOT VS REMOTE SOURCE)

In `src/control-plane/coach-routines.ts` lines 81–85 and 613–647, Sideline already distinguishes the local folder from the remote repository coordinate:
* **Local Game Root:** `C:\Users\dmcal\...\Game` — Authoritative on the desktop for active terminal execution, dirty working tree edits, and uncommitted reports.
* **Remote Coach Source:** `github.com/nowimhere3/Sideline-Coach • branch main` — Remotely resolvable coordinate for an Assistant Coach running on mobile.

### Generalized Coach Source Abstraction
To ensure Sideline is never permanently coupled to GitHub, each Game's routine metadata should model the Coach Source as an extensible interface:

```typescript
export type CoachSourceType = 'github' | 'gitlab' | 'google_drive' | 'relay_host_proxy' | 'none';

export interface GameCoachSource {
  type: CoachSourceType;
  /** Canonical public locator, e.g. "github.com/nowimhere3/Sideline-Coach" */
  locator: string;
  /** Branch or ref, e.g. "main" */
  branch?: string;
  /** Relative project files designated for Coach Refresh, e.g. ["docs/ROSTER.md", "DECISIONS.md"] */
  sources: string[];
  /** Remote accessibility state */
  visibility: 'public' | 'private' | 'local_only';
  /** Last sync timestamp or commit SHA if known */
  lastSyncAt?: number;
  lastCommitSha?: string;
}
```

### End-to-End Lookup Sequence When Dad is on his Phone:
1. **Path 1: Remote Coach Source Exists (GitHub Public or Authorized):**  
   The Assistant Coach handoff prompt (`buildStrategyBoardEnvelope` in `coach-routines.ts`) instructs the AI:
   *"If you cannot access the local Game folder, use the repository above (`github.com/user/repo`) and inspect the listed source paths there."*  
   The AI reads the source directly via GitHub web UI, raw CDN, or API.
2. **Path 2: Game Has No Remote Repository, But Desktop Host is Connected via Relay:**  
   The Relay safely asks the online desktop host for the specific files listed in `sources` (`GET /api/games/sources/content?paths=...`). The host reads the local disk and returns the file contents across the outbound tunnel.
3. **Path 3: Host Offline and No Remote Coach Source:**  
   The Assistant Coach prompt reports: *"No remote Coach Source is configured and the desktop host is offline. Reconnect your desktop or publish a Coach Source to refresh."*

---

# SIMPLE GIT FEATURES: LOCAL GIT VS API VS HYBRID

Dad is considering a simple/low-cost tier unlocking developer conveniences: status, branch awareness, commit, and push.

```
┌─────────────────┬───────────────────────────────────────────────────────────┐
│ APPROACH        │ VERDICT & RATIONALE                                       │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ PATH A:         │ **RECOMMENDED FOR MVP.**                                  │
│ Local Git CLI   │ • Zero GitHub OAuth repo permissions needed.              │
│ (Desktop Host)  │ • Zero tokens or SSH keys ever leave Dad's computer.       │
│                 │ • Reuses user's existing SSH agent & Git Credential Mgr.  │
│                 │ • Phone sends command: { action: 'git.commit', msg: '...' }│
│                 │   Host runs local git CLI and returns result.             │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ PATH B:         │ **NOT RECOMMENDED.**                                      │
│ GitHub API      │ • Requires broad repo OAuth scopes or fine-grained PAT.   │
│ (Cloud Relay)   │ • Huge user friction ("Sign in to read/write all repos"). │
│                 │ • Relay must hold sensitive access tokens.                │
│                 │ • Cannot commit unpushed/untracked local file trees.      │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ PATH C:         │ **RECOMMENDED FOR FUTURE ENHANCEMENTS.**                  │
│ Hybrid Model    │ • Local Git handles commit, push, branch, and status.     │
│                 │ • Read-only GitHub API handles remote PRs, issues, diffs. │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

**Architectural Invariant:** Local Git CLI execution on the desktop host avoids asking the user for intrusive GitHub permissions while ensuring repository write credentials never touch the cloud relay.

---

# EMAIL + MARKETING CONSENT MODEL

When a user signs in via GitHub, GitHub provides their account email (if public or requested via `user:email`). 

> [!IMPORTANT]
> **Provider-supplied authentication email is strictly an identity and account-recovery coordinate. It does NOT constitute legal or ethical permission to send marketing communications.**

### Durable Consent Data Schema
The Sideline User profile must maintain a durable, audit-proof consent record:

```typescript
export interface UserMarketingConsent {
  /** Explicit opt-in boolean (default: false) */
  optIn: boolean;
  /** ISO timestamp when consent was captured or updated */
  updatedAt: number;
  /** UI registration context, e.g. "onboarding_checkbox_v1", "settings_toggle" */
  source: string;
  /** Exact legal/disclosure copy presented to the human */
  disclosureVersion: string;
  disclosureText: string;
  /** Unsubscribe tracking */
  unsubscribedAt?: number;
  unsubscribeReason?: string;
}
```

### Rules:
1. **Pre-checked boxes are forbidden.** Opt-in must be an active human gesture.
2. If GitHub provides an email during OAuth, it populates `SidelineUser.primaryEmail` for transactional notices (e.g., security alerts, session revocation, billing receipts) only.
3. Marketing communications are gated strictly by `marketingConsent.optIn === true && !marketingConsent.unsubscribedAt`.

---

# PERMISSION ESCALATION MODEL (LEAST PRIVILEGE)

Permissions must be requested **just-in-time** based on user intent:

```
[ Step 1: Human Sign-In ]
  │ User clicks "Continue with GitHub"
  │ Request: Identity only (read:user, user:email)
  │ Result: sidelineUserId created, phone session authorized.
  ▼
[ Step 2: Connect Coach Source ]
  │ User selects a Public GitHub Repo
  │ Request: ZERO additional scopes (public repos need no auth).
  │ If User selects a Private GitHub Repo:
  │ Request: GitHub App installation on that SINGLE repo.
  ▼
[ Step 3: Developer Git Operations (Commit/Push) ]
  │ User enables "Git Controls" in Sideline
  │ Request: ZERO GitHub cloud scopes.
  │ Action: Sideline delegates to local desktop git CLI.
  ▼
[ Step 4: Advanced GitHub Cloud Features (PRs, Issues, Actions) ]
  │ User explicitly clicks "Link Pull Request Workflows"
  │ Request: GitHub App scoped permission for Pull Requests.
```

---

# MECHANISM EVALUATION: NATIVE VS CODE VS OAUTH APP VS GITHUB APP

| Mechanism | Primary Responsibility in Sideline | Pros | Cons / Limitations |
| :--- | :--- | :--- | :--- |
| **VS Code Built-in Auth** (`vscode.authentication`) | **Desktop Host Identity** | Zero infrastructure; zero secrets on host; uses VS Code OS keychain. | Only runs inside VS Code on desktop; unavailable to phone browser. |
| **GitHub OAuth App** | **Phone Browser Sign-In (Relay Edge)** | Standard mobile web redirect flow; simple human identity verification. | Repository permissions are "all-or-nothing" (`repo` scope grants access to *all* user repos). |
| **GitHub App** | **Remote Private Coach Sources & Cloud PRs** | **Fine-grained repo selection** (user picks 1 repo); short-lived tokens; org-friendly. | Slightly more complex redirect/installation setup than OAuth app. |
| **Local Git Credentials** | **Commit, Branch, Push, Diff** | Zero cloud tokens; works with existing user SSH keys; zero permission prompts. | Only runs while desktop host is active and accessible. |

---

# RELAY SECURITY BOUNDARIES (WHAT STAYS LOCAL)

The Sideline Relay is an ephemeral routing and pairing bridge. The following items must **NEVER** traverse, be processed by, or persist in the Relay:

1. **Local Git Credentials & Keys:** SSH private keys (`~/.ssh/id_*`), Git Credential Manager tokens, and GPG signing keys remain strictly on the host.
2. **AI Provider API Keys:** `SCOUT_OPENROUTER_SECRET_KEY` and vendor API tokens remain strictly in VS Code SecretStorage (`src/scout-openrouter-credential.ts`).
3. **Local Workspace Environment Secrets:** `.env*`, `.token`, and private configuration files are hard-blocked by `src/game-files.ts` and must never cross the remote boundary.
4. **Daemon Lifecycle & Process Endpoints:** `/api/control-plane/shutdown` must be rejected immediately if received from a remote relay connection.
5. **Raw Repository Code:** The relay does not clone, cache, or store repository trees on disk.

---

# ARCHITECT DECISIONS REQUIRED (FOR OPUS)

1. **User Identity Inception Point:**  
   *Does the initial MVP create a centralized `sidelineUserId` in a cloud database on first login, or does v1 operate in a pure peer-to-peer pairing mode (where the desktop and phone exchange a cryptographically verified GitHub user ID without a central user table)?*
2. **Coach Source Private Repo Resolution:**  
   *When Dad uses a private repository on his phone, should Sideline encourage using a GitHub App installation for remote access, or should the desktop host simply proxy the designated Coach Source files on-demand over the relay?*
3. **Git Mutation Execution Boundary:**  
   *Confirm that all simple Git actions (`git commit`, `git push`) will be executed exclusively through the host's local `git` CLI across the relay tunnel, rather than integrating GitHub REST commit APIs.*
4. **Marketing Consent Presentation:**  
   *Should the marketing consent checkbox be presented during the initial OAuth redirect landing page, or deferred to an in-app prompt when Dad enables remote access?*

---

# PROPOSED DURABLE BREADCRUMB

```markdown
### BREADCRUMB: SIDELINE IDENTITY, GITHUB TRIPLE-ROLE & COACH SOURCE ARCHITECTURE (S57.0)

- **Identity Separation:** Sideline user identity (`sidelineUserId`) is logically independent from external provider identities. A Sideline account may link GitHub, email/magic-link, Google, or passkeys over time.
- **GitHub Role Decoupling:** GitHub serves three separate architectural functions: (1) Human Identity Provider, (2) Coach Source Locator, and (3) Developer Git Action Target. These functions must not be conflated into a single monolithic permission grant.
- **Least-Privilege Escalation:** Authentication permission (`read:user`) is strictly decoupled from repository permissions. Sign-in must never request `repo` scopes. Repository access is granted just-in-time per specific repository.
- **Extensible Coach Sources:** Game documentation for Assistant Coach / Coach Refresh relies on a generalized `CoachSource` abstraction (e.g. `github.com/owner/repo • branch`). The locator pattern must remain provider-extensible to support Google Drive, GitLab, or local relay proxies without architectural refactoring.
- **Marketing Consent Invariant:** Provider-supplied authentication email is strictly an identity coordinate and does NOT constitute marketing consent. Marketing consent must record an explicit opt-in boolean, timestamp, disclosure copy version, and unsubscribe state.
- **Git Execution Boundary:** Core developer actions (status, branch, commit, push) are executed by the desktop host's local Git CLI using existing local credentials. Git credentials, SSH private keys, and repository write tokens must never traverse or persist in the remote relay gateway.
```

---

The final Scout report is available at:
[SCOUT-remote-access-v1-identity-github-coach-source.md](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/AntiGravity/SCOUT-remote-access-v1-identity-github-coach-source.md)
