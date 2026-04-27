# Prometheus метрики
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response
from typing import Optional

_ws_connections_active: Optional[Gauge] = None
_ws_messages_total: Optional[Counter] = None


def init_metrics():
    global _ws_connections_active, _ws_messages_total
    _ws_connections_active = Gauge(
        "websocket_connections_active",
        "Number of active WebSocket connections",
    )
    _ws_messages_total = Counter(
        "websocket_messages_total",
        "Total number of WebSocket messages processed",
        ["type"],
    )


def get_ws_connections_gauge() -> Optional[Gauge]:
    return _ws_connections_active


def get_ws_messages_counter() -> Optional[Counter]:
    return _ws_messages_total


def increment_message_count(msg_type: str):
    if _ws_messages_total:
        _ws_messages_total.labels(type=msg_type).inc()


def set_active_connections(count: int):
    if _ws_connections_active:
        _ws_connections_active.set(count)


def get_metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
