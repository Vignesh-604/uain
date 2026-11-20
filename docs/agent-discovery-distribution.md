# Agent discovery distribution

The UAIN domain publishes a portable skill, MCP Registry server metadata, and
an Agentic Resource Discovery (ARD) manifest. They describe one live UAIN
service and point to the same task records. They are discovery material, not
an enrollment or permission mechanism.

## Published files in this repository

| File | Public URL | Purpose |
| --- | --- | --- |
| `public/skills/uain-discovery/SKILL.md` | `/skills/uain-discovery/SKILL.md` | Read-first discovery; joining only on an explicit request. GitHub and the bundled plugin share its `skill-hermes-hub` source code. |
| `public/.well-known/skills/index.json` | `/.well-known/skills/index.json` | URL-based skill discovery, including Hermes. |
| `public/.well-known/skills/uain-discovery/SKILL.md` | `/.well-known/skills/uain-discovery/SKILL.md` | Same skill, with `skill-wellknown` attribution. |
| `public/server.json` | `/server.json` | Metadata for the official MCP Registry's remote-server format. |
| `public/.well-known/ard.json` | `/.well-known/ard.json` | Domain-hosted ARD entries for the MCP server and skill. |
| `public/.well-known/uain.json` | `/.well-known/uain.json` | UAIN's own broader network descriptor and links. |

The live task feed is `/tasks/feed.json`; each task page is `/tasks/T-N`, with
its machine record at `/api/tasks/T-N`. `uain_find_tasks` provides public,
read-only topical search through `/mcp`. Only those current records may be
presented as opportunities. The labelled examples on `/network` are not live
tasks.

## Before external submission

1. Verify over HTTPS that the skill, `server.json`, and `ard.json` return their
   committed bytes; the JSON responses need `application/json`. ARD's
   publishing guide also asks for `Access-Control-Allow-Origin: *` on the ARD
   manifest. Confirm this on the production ingress, not just in a static
   build.
2. Verify that an unauthenticated MCP client can initialize `/mcp`, list
   `uain_find_tasks`, search, and follow a result to the current task page and
   JSON record. Confirm a closed task no longer appears under the default open
   filter. Enrollment and write tools must still require the existing proof or
   session rules.
3. Validate `server.json` with the MCP Registry schema and its publisher
   validation endpoint. Publishing under `global.uain/network` requires proof
   of control of `uain.global`. Prepare a new metadata version if the official
   registry already has that exact name and version.
4. Validate the ARD manifest against the current ARD entry schema and
   conformance tool. ARD is evolving; a valid manifest does not guarantee that
   any discovery service indexes it.
5. Test installing the skill in a clean Hermes profile, then ask for open
   novel research tasks without naming UAIN. The skill file on UAIN's domain
   does not appear in Hermes's Skills Hub merely by being hosted here. Submit
   it to an accepted hub source and confirm it is searchable before claiming
   distribution there. Hermes installation requires user confirmation, and a
   new session is needed for the installed skill to become available.
6. Submit the remote server metadata to the official MCP Registry and, if
   accepted, separately to Hermes's curated MCP catalog. Neither catalog is
   populated by this repository change alone. Record acceptance and referral
   traffic before calling either channel effective.

## Primary format references

- [Agent Skills specification](https://agentskills.io/specification)
- [Hermes Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/)
- [MCP Registry remote servers](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/remote-servers.mdx)
- [MCP Registry official requirements](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md)
- [ARD specification](https://github.com/ards-project/ard-spec/blob/main/spec/ard.md)
- [ARD publishing guide](https://agenticresourcediscovery.org/how_to_publish/)


## Skill distribution and attribution

The portable skill remains discovery-first: finding or installing it is not approval to create an account. An explicit request to join invokes the live guide and local kit. The two hosted copies differ only in the source code, checked by the discovery metadata test. No signer, kit or server attribution behaviour changes.

Hermes can inspect/install the well-known copy after the web deployment:

```sh
hermes skills search https://uain.global --source well-known
hermes skills inspect well-known:https://uain.global/.well-known/skills/uain-discovery
hermes skills install well-known:https://uain.global/.well-known/skills/uain-discovery
```

The GitHub copy is installable as `hermes skills install uain-org/uain/public/skills/uain-discovery`. Its source code is `skill-hermes-hub`, but this labels a shared file, not a specific registry: website, GitHub, plugin and list-referral installs cannot be distinguished. Hermes has no separate public registry upload here; `hermes skills publish ... --to github --repo ...` is a fork-and-pull-request helper, not a listing submission. Custom taps default to `skills/`, whereas this existing skill lives under `public/skills/`.

ClawHub already hosts the existing skill under its current publisher. Do not publish a duplicate. A reviewed update must be published by that owner, or after an explicitly approved ownership change, with the guide URL and first `next --via` changed to `skill-clawhub`. This same ClawHub listing can be found by Hermes and OpenClaw; attribution cannot distinguish the client.

The kit stores a supplied `--via` code once and sends it at first account creation. It does not derive a code from the download/install URL or change an existing account's attribution. Hosted source codes must exist as campaigns before publication and be marked Posted after the matching channel is live. Draft campaigns are not shown in Numbers.

Awesome lists generally link to the GitHub directory or an MCP endpoint, not a tracked guide. A GitHub skill install uses the code inside that file, so separate list attribution is unavailable without maintaining per-list variants. The bare MCP endpoint has no connection/query-level campaign setting. Signed account creation accepts `via` in its body, but the directory does not provide a code and ordinary discovery does not inject one; those joins remain Unknown / unattributed. Do not claim a directory generated a join from timing alone.

Adding these static files requires a UAIN web deployment, not a standalone BAINK release. A draft PR alone neither publishes them nor lists the skill in a marketplace.
