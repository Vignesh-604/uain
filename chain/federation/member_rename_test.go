package federation

import (
	"bytes"
	"testing"
)

func renameHistory(t *testing.T, k Keeper, member string, n int) MemberRename {
	t.Helper()
	var r MemberRename
	if err := committedRecordAny(k.Store, memberRenameKey(member, n), &r); err != nil {
		t.Fatalf("rename %d: %v", n, err)
	}
	return r
}

func committedRecordAny(s Store, key string, record any) error {
	raw, err := decodeEvidence(s.Get([]byte(key)))
	if err != nil {
		return err
	}
	return Decode(raw, record)
}

func TestMemberRenameIsUnknownBeforeActivation(t *testing.T) {
	k, lead, peer, _ := fixture(t)
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "Peer renamed"}, 2)
	// Only a guardian may activate it.
	rejectCommand(t, k, lead, "", "member_rename_activate", map[string]any{"policy": MemberRenamePolicy, "evidence_digest": digest}, 2)
}

func TestMemberRenameChangesOnlyTheNameAndKeepsHistory(t *testing.T) {
	k, lead, peer, def := fixture(t)
	command(t, k, def, "member_rename_activate", map[string]any{"policy": MemberRenamePolicy, "evidence_digest": digest}, 2)
	rejectCommand(t, k, def, "", "member_rename_activate", map[string]any{"policy": MemberRenamePolicy, "evidence_digest": digest}, 3)

	command(t, k, peer, "member_rename", map[string]any{"name": "Peer renamed"}, 3)
	m, err := k.Member(peer.m.ID)
	if err != nil || m.Name != "Peer renamed" || m.Operator != peer.m.Operator || m.Family != peer.m.Family {
		t.Fatal(m, err)
	}
	if r := renameHistory(t, k, peer.m.ID, 1); r.From != peer.m.Name || r.To != "Peer renamed" || r.Height != 3 || r.Member != peer.m.ID {
		t.Fatal(r)
	}
	// Another member's name is untouched; payloads cannot change the operator.
	if other, _ := k.Member(lead.m.ID); other.Name != lead.m.Name {
		t.Fatal(other)
	}
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "Peer renamed"}, 4)
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": " padded"}, 4)
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "x"}, 4)
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "bad\nname"}, 4)
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "Fine", "operator": "Someone else"}, 4)
}

func TestMemberRenameLimit(t *testing.T) {
	k, _, peer, def := fixture(t)
	command(t, k, def, "member_rename_activate", map[string]any{"policy": MemberRenamePolicy, "evidence_digest": digest}, 2)
	names := []string{"One", "Two", "Three", "Four", "Five"}
	for i, name := range names {
		command(t, k, peer, "member_rename", map[string]any{"name": name}, int64(3+i))
	}
	rejectCommand(t, k, peer, "", "member_rename", map[string]any{"name": "Six"}, 8)
	if r := renameHistory(t, k, peer.m.ID, 5); r.From != "Four" || r.To != "Five" {
		t.Fatal(r)
	}
}

func TestMemberRenameUnderCompactStorage(t *testing.T) {
	k, _, peer, def := fixture(t)
	command(t, k, def, "activate_storage", map[string]any{"policy": CompactStatePolicy, "evidence_digest": digest}, 1)
	command(t, k, peer, "identity_claim", map[string]any{}, 2)
	before, err := k.Member(peer.m.ID)
	if err != nil || before.AccountPolicy != CompactAccountPolicy {
		t.Fatal(before, err)
	}
	oldMetadata := bytes.Clone(k.Store.Get([]byte("member_metadata/" + peer.m.ID)))
	command(t, k, def, "member_rename_activate", map[string]any{"policy": MemberRenamePolicy, "evidence_digest": digest}, 3)
	command(t, k, peer, "member_rename", map[string]any{"name": "Compact renamed"}, 4)

	m, err := k.Member(peer.m.ID)
	if err != nil || m.Name != "Compact renamed" || m.Operator != peer.m.Operator || m.MetadataDigest == before.MetadataDigest {
		t.Fatal(m, err)
	}
	if bytes.Equal(oldMetadata, k.Store.Get([]byte("member_metadata/"+peer.m.ID))) {
		t.Fatal("metadata not replaced")
	}
	if r := renameHistory(t, k, peer.m.ID, 1); r.PreviousDigest != before.MetadataDigest || r.From != peer.m.Name {
		t.Fatal(r)
	}
	// Other writers still cannot change metadata.
	m.Name = "sneaky"
	if err = put(k.Store, "member/"+m.ID, m); err == nil {
		t.Fatal("balance writer replaced metadata")
	}
}
