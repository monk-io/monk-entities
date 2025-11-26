package main

import (
	"context"
	"fmt"
	"time"
)

// Event represents the input to the function
type Event struct {
	Name   string                 `json:"name"`
	Query  map[string]interface{} `json:"query"`
	Body   map[string]interface{} `json:"body"`
	Method string                 `json:"__ow_method"`
	Path   string                 `json:"__ow_path"`
}

// Response represents the function output
type Response struct {
	StatusCode int               `json:"statusCode,omitempty"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       interface{}       `json:"body"`
}

// Main is the entry point for the DigitalOcean Function
// Based on the official sample: https://github.com/digitalocean/sample-functions-golang-helloworld
func Main(ctx context.Context, event Event) Response {
	// Extract name from various sources
	name := "stranger"

	if event.Name != "" {
		name = event.Name
	} else if event.Query != nil {
		if queryName, exists := event.Query["name"]; exists {
			if nameStr, ok := queryName.(string); ok {
				name = nameStr
			}
		}
	}

	// Get HTTP method and path
	method := "GET"
	if event.Method != "" {
		method = event.Method
	}

	path := "/"
	if event.Path != "" {
		path = event.Path
	}

	// Log the request
	fmt.Printf("Received %s request to %s with name: %s\n", method, path, name)

	// Handle different HTTP methods
	switch method {
	case "GET":
		return Response{
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type":                "application/json",
				"Access-Control-Allow-Origin": "*",
			},
			Body: map[string]interface{}{
				"message":   fmt.Sprintf("Hello %s!", name),
				"timestamp": time.Now().Format(time.RFC3339),
				"method":    method,
				"path":      path,
				"runtime":   "Go (go:default)",
				"language":  "golang",
			},
		}

	case "POST":
		// Handle POST request
		receivedData := event.Body
		if receivedData == nil {
			receivedData = map[string]interface{}{
				"name": name,
			}
		}

		return Response{
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type":                "application/json",
				"Access-Control-Allow-Origin": "*",
			},
			Body: map[string]interface{}{
				"message":      "Data received successfully",
				"receivedData": receivedData,
				"timestamp":    time.Now().Format(time.RFC3339),
			},
		}

	default:
		return Response{
			StatusCode: 405,
			Headers: map[string]string{
				"Content-Type":                "application/json",
				"Access-Control-Allow-Origin": "*",
			},
			Body: map[string]interface{}{
				"error":          fmt.Sprintf("Method %s not allowed", method),
				"allowedMethods": []string{"GET", "POST"},
			},
		}
	}
}
