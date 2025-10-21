// Package logging initializes setup the global logger with telemetry hooks.
// For this to work this package needs to be imported with the blank
// identifier.
// This package also exports a new logger constructor useful for packages that
// need to use custom logger and won't rely on the global one.
package logging

import (
	"os"
	"strconv"

	log "github.com/sirupsen/logrus"
	"go.opentelemetry.io/otel/trace"
)

// These are the log level that we support.
// We should rely on them when retrieving them from the
// environment variables.
const (
	Debug = "DEBUG"
	Info  = "INFO"
	Warn  = "WARN"
	Error = "ERROR"
)

// init initializes the logger by adding a hook to add fields in the context, setting the log level and formatter based on environment variables.
// If the log level is set to debug, it also sets the report caller to true to log the filename and line number.
func init() {
	//add a hook to the logger to add the fields in the context
	log.AddHook(&logrusContextHook{})
	log.AddHook(&logrusFieldFilterHook{})

	// Get log level from environment variable
	logLevel, ok := os.LookupEnv("LOG_LEVEL")
	if !ok {
		logLevel = "info" // Default log level
	}

	// Parse log level from string
	level, err := log.ParseLevel(logLevel)
	if err != nil {
		log.Fatal(err)
	}

	log.SetLevel(level)

	// Set the logging format given the value set in ENV.
	log.SetFormatter(formatterFromEnv())

	//If log level is debug
	// Add this line for logging filename and line number!
	if log.StandardLogger().GetLevel() == log.DebugLevel {
		log.SetReportCaller(true)
	}
}

// formatterFromEnv returns a new formatter based on LOG_FORMAT.
func formatterFromEnv() log.Formatter {
	logFormat := os.Getenv("LOG_FORMAT")

	if logFormat == "json" {
		return &log.JSONFormatter{}
	}

	return &log.TextFormatter{}
}

type logrusContextHook struct {
}

func (hook *logrusContextHook) Levels() []log.Level {
	return log.AllLevels
}

// Fire is called when a log event is fired. It extracts the trace ID and span ID from the log entry's context
// and adds them as fields to the log entry. The fields are named dd.trace_id and dd.span_id respectively based on the Datadog convention.
func (hook *logrusContextHook) Fire(entry *log.Entry) error {
	span := trace.SpanFromContext(entry.Context).SpanContext()

	if span.IsValid() {
		traceID := span.TraceID().String()
		spanID := span.SpanID().String()

		//Add the fields of trace id and span id to the log entry
		entry.Data["dd.trace_id"] = convertTraceID(traceID)
		entry.Data["dd.span_id"] = convertTraceID(spanID)
	}

	return nil
}

type logrusFieldFilterHook struct{}

func (h *logrusFieldFilterHook) Levels() []log.Level {
	return log.AllLevels
}

func (h *logrusFieldFilterHook) Fire(entry *log.Entry) error {
	// this will remove "hostname" as it is set by "ginlogrus" middleware
	// and its preventing the logs to be indexed by DD
	delete(entry.Data, "hostname")

	return nil
}

// Took from DD https://docs.datadoghq.com/tracing/other_telemetry/connect_logs_and_traces/opentelemetry?tab=go
func convertTraceID(id string) string {
	if len(id) < 16 {
		return ""
	}
	if len(id) > 16 {
		id = id[16:]
	}
	intValue, err := strconv.ParseUint(id, 16, 64)
	if err != nil {
		return ""
	}

	return strconv.FormatUint(intValue, 10)
}
