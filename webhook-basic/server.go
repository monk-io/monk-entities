package main

import (
	"encoding/json"
	"net/http"
)

type webhookContext struct {
	Status string `json:"status"`
	Action string `json:"action"`
	Path   string `json:"path"`
}

type webhookRequest struct {
	Definition map[string]interface{} `json:"definition"`
	State      map[string]interface{} `json:"state"`
	Context    webhookContext         `json:"context"`
}

type webhookResponse struct {
	Output []string               `json:"output,omitempty"`
	State  map[string]interface{} `json:"state,omitempty"`
}

func hello(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var req webhookRequest
	err := decoder.Decode(&req)
	if err != nil {
		panic(err)
	}
	
	state, err := json.Marshal(req.State)
	if err != nil {
		panic(err)
	}

	resp := webhookResponse{
		Output: []string{"ACTION " + req.Context.Action, "STATUS " + req.Context.Status, "STATE " + string(state)},
		State: map[string]interface{}{
				"def": req.Definition,
				"ctx": req.Context,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		panic(err)
	}

	_, err = w.Write(data)
	if err != nil {
		panic(err)
	}
}

func main() {
	http.HandleFunc("/", hello)
	http.ListenAndServe(":8090", nil)
}
