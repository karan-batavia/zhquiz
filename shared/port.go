package shared

// Port get server port
func Port() string {
	return GetenvOrDefault("PORT", "8080")
}
