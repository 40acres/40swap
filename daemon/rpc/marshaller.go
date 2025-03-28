package rpc

import (
	"encoding/json"
)

// MarshalJSON implements the json.Marshaler interface for Status.
func (s Status) MarshalJSON() ([]byte, error) {
	return json.Marshal(s.String())
}

// MarshalIndent is a helper function to marshal Status with indentation.
func (s Status) MarshalIndent(prefix, indent string) ([]byte, error) {
	raw, err := s.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var formatted interface{}
	if err := json.Unmarshal(raw, &formatted); err != nil {
		return nil, err
	}

	return json.MarshalIndent(formatted, prefix, indent)
}
