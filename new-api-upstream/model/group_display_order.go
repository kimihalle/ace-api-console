package model

import (
	"errors"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const GroupDisplayOrderOption = "GroupDisplayOrder"

// Display order is independent of group prices, visibility and Auto routing.
func validateGroupDisplayOrder(value string) error {
	var names []string
	if err := common.UnmarshalJsonStr(value, &names); err != nil || names == nil {
		return errors.New("Expected a JSON array of group identifiers")
	}
	seen := make(map[string]bool, len(names))
	for _, name := range names {
		if strings.TrimSpace(name) == "" || name != strings.TrimSpace(name) || seen[name] {
			return errors.New("Group display order must contain unique non-empty group names")
		}
		seen[name] = true
	}
	return nil
}

// Only expose names already visible to this user. New groups follow saved ones.
func GetGroupDisplayOrder(usableGroups map[string]string) []string {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[GroupDisplayOrderOption]
	common.OptionMapRWMutex.RUnlock()
	var saved []string
	_ = common.UnmarshalJsonStr(raw, &saved)
	ordered := make([]string, 0, len(usableGroups))
	seen := make(map[string]bool, len(usableGroups))
	for _, name := range saved {
		if _, usable := usableGroups[name]; usable && name != "auto" && !seen[name] {
			ordered = append(ordered, name)
			seen[name] = true
		}
	}
	remaining := make([]string, 0, len(usableGroups))
	for name := range usableGroups {
		if name != "auto" && !seen[name] {
			remaining = append(remaining, name)
		}
	}
	slices.Sort(remaining)
	return append(ordered, remaining...)
}
