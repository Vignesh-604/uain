# Admin Members table

The Numbers page has a separate sortable Members table. It joins the complete proved native member list with local BAINK accounts by address, including accounts without campaign attribution. The existing campaign tables and attribution are unchanged. Source is the stored `via` code or `Unknown / unattributed`; it is never inferred from IP or activity.

Karma uses the same cached list and in-flight request as campaign acceptance, with no per-member HTTP requests. AI$ earnings are not loaded. If the proved list is unavailable, known local accounts remain visible with unknown Karma. Counts represent accounts, not unique people. Archival unclaimed identities are omitted.

Optional `<BAINK_DATA_DIR>/admin-member-classes.json` is a private JSON object mapping explicit addresses to `External` or `Team-test`. Missing addresses or other values show `Unclassified`. Populate only from verified ownership evidence. Never classify by IP or name patterns. The file is reread each page load and is not shipped in the public source. An absent or invalid file defaults everyone to Unclassified.

Sort links use `memberSort=name|source|group|karma` and `memberDir=asc|desc`. They preserve campaign sorting; unknown values are ignored, and unreadable Karma sorts last.

## Tabs and private signup evidence

Numbers uses `?tab=members|posts|replies` (Posts is the default). Links retain campaign and member sort parameters. Existing member-sort URLs select Members. Members can sort by approximate signup location or enable `groupBy=ip`; unknown IPs stay separate and unknown Karma is never summed as zero. IPs are revealed only inside authenticated admin HTML, not member APIs or the marketing token API. An IP group is a shared network, not proof of one person.

`admin-member-origins.json` in the private data directory records first successful account creation only, separately from public account metadata. It holds creation time, IP or null, evidence, and optional cached approximate location. No external geolocation call is made on signup or page load. Unavailable location stays Unknown. Location enrichment is a separate private operation; this release reuses only existing verified location evidence.

Direct socket peers are used unless trusted-proxy mode and a loopback peer establish nginx's overwritten `X-Real-IP`. Arbitrary forwarded headers are ignored. Internal MCP relays are marked in process and never saved as a person's IP. Operators must list upstream service addresses in private `BAINK_SIGNUP_SERVICE_IPS` (comma separated); proxy addresses without reliable original-client evidence remain Unknown. Local/private peers are Unknown. Changes to proxy topology require reviewing this list, not trusting a new forwarded header.

Historical evidence is accepted only when exactly one account and exactly one successful `POST /api/account` (201) share a UTC creation second across the retained logs. Ambiguous matches, missing logs, native-only members and known service peers remain Unknown. Retain the evidence method privately. Never infer signup IP from later page views or campaign opens. Keep the private file mode 0600 and ownership with the service; do not commit addresses, IPs, or location associations to source.

Members has a sortable Joined column: valid local account creation time first, otherwise valid `joined_at` from the proved native member list. Missing timestamps display an em dash and sort last in either direction. Dates display UTC. Campaign Posts and Replies have a sortable Updated column using stored `updatedAt`, then `createdAt`; it is not a claimed publication date. Undated seed campaigns sort last for date sorts. Defaults remain unchanged.
