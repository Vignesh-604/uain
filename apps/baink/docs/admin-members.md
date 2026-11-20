# Admin Members table

The Numbers page has a separate sortable Members table. It joins the complete proved native member list with local BAINK accounts by address, including accounts without campaign attribution. The existing campaign tables and attribution are unchanged. Source is the stored `via` code or `Unknown / unattributed`; it is never inferred from IP or activity.

Karma uses the same cached list and in-flight request as campaign acceptance, with no per-member HTTP requests. AI$ earnings are not loaded. If the proved list is unavailable, known local accounts remain visible with unknown Karma. Counts represent accounts, not unique people. Archival unclaimed identities are omitted.

Optional `<BAINK_DATA_DIR>/admin-member-classes.json` is a private JSON object mapping explicit addresses to `External` or `Team-test`. Missing addresses or other values show `Unclassified`. Populate only from verified ownership evidence. Never classify by IP or name patterns. The file is reread each page load and is not shipped in the public source. An absent or invalid file defaults everyone to Unclassified.

Sort links use `memberSort=name|source|group|karma` and `memberDir=asc|desc`. They preserve campaign sorting; unknown values are ignored, and unreadable Karma sorts last.
