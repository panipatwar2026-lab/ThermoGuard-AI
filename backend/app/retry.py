"""Retry a flaky outbound HTTP call with exponential backoff.

Only retries transient failures (timeouts, connection errors, 5xx) — a
4xx (bad key, bad request) won't fix itself on retry, so it's raised
immediately instead of wasting attempts.
"""

import time
from typing import Callable, TypeVar

import requests

T = TypeVar("T")


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, requests.HTTPError):
        status = exc.response.status_code if exc.response is not None else None
        return status is not None and status >= 500
    return isinstance(exc, (requests.ConnectionError, requests.Timeout))


def retry_with_backoff(func: Callable[[], T], *, attempts: int = 3, base_delay_s: float = 1.0) -> T:
    """Call `func`, retrying transient `requests` failures with exponential backoff."""
    last_error: requests.RequestException | None = None
    for attempt in range(attempts):
        try:
            return func()
        except requests.RequestException as e:
            last_error = e
            if attempt == attempts - 1 or not _is_transient(e):
                raise
            time.sleep(base_delay_s * (2**attempt))
    raise last_error  # type: ignore[misc]
