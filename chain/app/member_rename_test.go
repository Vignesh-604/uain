package app

import (
	"strings"
	"testing"

	dbm "github.com/cosmos/cosmos-db"

	"github.com/uain-org/uain/chain/federation"
)

// Before member-rename-v1 activation, member_rename must cost exactly what an unknown
// operation of the same length did on 0.4.2, so replayed history is unchanged.
func TestMemberRenameCostsExactlyAnUnknownOperationBeforeActivation(t *testing.T) {
	if _, ok := RegisteredUpgrades()[MemberRenameUpgrade]; !ok {
		t.Fatal("0.4.3 handler not registered")
	}
	m, key := testMember("rename-guardian")
	g := federation.Genesis{Version: 1, Guardians: []string{m.ID}, Members: []federation.Member{m}}
	a := initApp(t, dbm.NewMemDB(), g)
	payload := map[string]any{"name": "Another name"}
	op := "member_rename"
	unknown := "x" + strings.Repeat("y", len(op)-1)
	got := block(t, a, 1, testEnvelope(t, m, key, 0, op, payload))
	want := block(t, a, 2, testEnvelope(t, m, key, 0, unknown, payload))
	if got.TxResults[0].Code == 0 || want.TxResults[0].Code == 0 {
		t.Fatal("member_rename or its unknown twin succeeded before activation")
	}
	if got.TxResults[0].GasUsed != want.TxResults[0].GasUsed || got.TxResults[0].Code != want.TxResults[0].Code {
		t.Fatalf("member_rename gas %d code %d, unknown operation gas %d code %d", got.TxResults[0].GasUsed, got.TxResults[0].Code, want.TxResults[0].GasUsed, want.TxResults[0].Code)
	}
}
