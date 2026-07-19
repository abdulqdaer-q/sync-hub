from __future__ import annotations

from collections.abc import Sequence

from .commands import command_registry
from .commands.parser import build_parser
from .config import WorkerConfig

__all__ = ["build_parser", "main"]


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return command_registry.dispatch(args.command, args, WorkerConfig.from_env())


if __name__ == "__main__":
    raise SystemExit(main())
