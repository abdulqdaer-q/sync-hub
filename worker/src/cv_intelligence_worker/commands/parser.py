from __future__ import annotations

import argparse

from .registry import CommandRegistry, command_registry


def _common_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--tenant-id", dest="tenant_id", default="", help="Tenant UUID")
    parser.add_argument("--uploaded-by", dest="uploaded_by", default="", help="User identifier for audit metadata")
    parser.add_argument("--no-sync", action="store_true", help="Do not push artifacts to Supabase")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    return parser


def build_parser(registry: CommandRegistry = command_registry) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Offline worker for the CV Intelligence Platform")
    subparsers = parser.add_subparsers(dest="command", required=True)
    common = _common_parser()
    for command in registry.specs():
        command_parser = subparsers.add_parser(command.name, help=command.help, parents=[common])
        command.configure(command_parser)
    return parser
