from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

registry = CollectorRegistry()

connections_active = Gauge(
    "chat_ws_connections_active", "Open WebSocket connections on this instance.", registry=registry
)
connections_rejected = Counter(
    "chat_ws_connections_rejected_total", "Handshakes refused.", ["reason"], registry=registry
)
frames_received = Counter("chat_ws_frames_received_total", "Frames received from clients.", ["type"], registry=registry)
messages_persisted = Counter("chat_messages_persisted_total", "Chat messages stored.", registry=registry)
messages_rate_limited = Counter(
    "chat_messages_rate_limited_total", "Chat messages rejected by the per-connection limit.", registry=registry
)
slow_consumers = Counter(
    "chat_ws_slow_consumer_disconnects_total",
    "Connections closed because their send queue was full.",
    registry=registry,
)
heartbeat_timeouts = Counter(
    "chat_ws_heartbeat_timeouts_total", "Connections closed for not answering pings.", registry=registry
)
message_handling = Histogram(
    "chat_message_handling_seconds",
    "Time from receiving a chat frame to publishing it (validation, DB insert, Redis publish).",
    buckets=(0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
    registry=registry,
)
