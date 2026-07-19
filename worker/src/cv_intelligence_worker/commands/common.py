from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from dataclasses import replace

from ..config import WorkerConfig


def emit_json(payload: object, *, pretty: bool) -> None:
    if pretty:
        output = json.dumps(payload, indent=2, sort_keys=True)
    else:
        output = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    print(output)


def progress_printer(disabled: bool) -> Callable[[str], None] | None:
    return None if disabled else lambda message: print(message, file=sys.stderr, flush=True)


def resolve_tenant_id(args: argparse.Namespace, config: WorkerConfig) -> str:
    return args.tenant_id or config.tenant_id or config.device_id or "tenant-local"


def resolve_configured_tenant_id(args: argparse.Namespace, config: WorkerConfig) -> str:
    return args.tenant_id or config.tenant_id


def resolve_discovery_inputs(args: argparse.Namespace, config: WorkerConfig) -> list[str]:
    return list(args.inputs) if args.inputs else [config.source_dir]


def with_ingest_overrides(config: WorkerConfig, args: argparse.Namespace) -> WorkerConfig:
    updates: dict[str, int] = {}
    if args.concurrency is not None:
        updates["ingest_concurrency"] = args.concurrency
    if args.sync_batch_size is not None:
        updates["batch_size"] = args.sync_batch_size
    if args.supabase_row_batch_size is not None:
        updates["supabase_batch_size"] = args.supabase_row_batch_size
    return replace(config, **updates) if updates else config
