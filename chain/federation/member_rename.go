package federation

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// MemberRenamePolicy (19 November 2026) lets a member change its own public name.
//
// Before this policy a member's name was fixed at enrolment: there was no way to correct
// a placeholder or test name. With the policy on, member_rename lets the member, signing
// with its own key, replace its name. Only the name changes: the operator and family are
// untouched, so an operator disclosure (for example a house agent's) cannot be removed
// this way. Every rename is kept as a public, immutable history record
// (member_rename/<member>/<n>) with the old name, the new name and the height, so the
// change is visible to anyone reading the ledger. A member may rename itself at most
// MaxMemberRenames times.
//
// Nothing changes until a guardian records member_rename_activation; before that,
// member_rename is an unknown operation, so replayed history is unaffected.
const (
	MemberRenamePolicy = "member-rename-v1"
	MaxMemberRenames   = 5
)

type MemberRenameActivation struct {
	Policy         string `json:"policy"`
	Height         int64  `json:"height,string"`
	ApprovedBy     string `json:"approved_by"`
	EvidenceDigest string `json:"evidence_digest"`
}

// MemberRename is one public rename record. It is never overwritten.
type MemberRename struct {
	Member         string `json:"member"`
	Number         int    `json:"number"`
	From           string `json:"from"`
	To             string `json:"to"`
	Height         int64  `json:"height,string"`
	PreviousDigest string `json:"previous_digest,omitempty"`
}

func memberRenameKey(member string, n int) string {
	return fmt.Sprintf("member_rename/%s/%d", member, n)
}

// memberRename reports whether member_rename is allowed at height.
func (k Keeper) memberRename(height int64) (bool, error) {
	raw := k.Store.Get([]byte("member_rename_activation"))
	if raw == nil {
		return false, nil
	}
	var a MemberRenameActivation
	if e := Decode(raw, &a); e != nil {
		return false, e
	}
	if a.Policy != MemberRenamePolicy || a.Height < 2 {
		return false, errors.New("invalid member rename activation")
	}
	return height >= a.Height, nil
}

func (k Keeper) memberRenameActivate(c Command, height int64) (string, error) {
	var in struct {
		Policy         string `json:"policy"`
		EvidenceDigest string `json:"evidence_digest"`
	}
	if e := Decode(c.Payload, &in); e != nil {
		return "", e
	}
	if !k.guardian(c.Member) || in.Policy != MemberRenamePolicy || !digestPattern.MatchString(in.EvidenceDigest) || height < 1 || k.Store.Get([]byte("member_rename_activation")) != nil {
		return "", errors.New("invalid member rename activation")
	}
	a := MemberRenameActivation{Policy: in.Policy, Height: height + 1, ApprovedBy: c.Member, EvidenceDigest: in.EvidenceDigest}
	return in.Policy, put(k.Store, "member_rename_activation", a)
}

// validMemberName applies the enrolment rules plus: no control characters, valid UTF-8,
// no leading or trailing spaces.
func validMemberName(name string) bool {
	if !utf8.ValidString(name) || name != strings.TrimSpace(name) || len(name) < 2 || len(name) > 120 {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// renameMember changes the signing member's own name and records the change publicly.
func (k Keeper) renameMember(c Command, height int64) (string, error) {
	var in struct {
		Name string `json:"name"`
	}
	if e := Decode(c.Payload, &in); e != nil {
		return "", e
	}
	if c.Instance != "" {
		return "", errors.New("a member renames itself, not through an instance")
	}
	if !validMemberName(in.Name) {
		return "", errors.New("invalid member name")
	}
	m, err := k.Member(c.Member)
	if err != nil {
		return "", err
	}
	if m.Name == in.Name {
		return "", errors.New("the new name is the current name")
	}
	n := 1
	for ; n <= MaxMemberRenames; n++ {
		if k.Store.Get([]byte(memberRenameKey(m.ID, n))) == nil {
			break
		}
	}
	if n > MaxMemberRenames {
		return "", errors.New("member rename limit reached")
	}
	record := MemberRename{Member: m.ID, Number: n, From: m.Name, To: in.Name, Height: height, PreviousDigest: m.MetadataDigest}
	if _, err = storeImmutable(k.Store, memberRenameKey(m.ID, n), record); err != nil {
		return "", err
	}
	if m.AccountPolicy == CompactAccountPolicy {
		// The only writer allowed to replace member metadata: the old record's digest is
		// kept in the rename history above, so the replaced name stays provable.
		raw, err := json.Marshal(MemberMetadata{m.ID, in.Name, m.Operator, m.Family})
		if err != nil {
			return "", err
		}
		stored, err := encodeEvidence(raw)
		if err != nil {
			return "", err
		}
		k.Store.Set([]byte("member_metadata/"+m.ID), stored)
		m.MetadataDigest = recordDigest(raw)
	}
	m.Name = in.Name
	return m.ID, put(k.Store, "member/"+m.ID, m)
}
