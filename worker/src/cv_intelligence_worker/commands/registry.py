from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass

from ..config import WorkerConfig


ArgumentConfigurator = Callable[[argparse.ArgumentParser], None]
CommandHandler = Callable[[argparse.Namespace, WorkerConfig], int]


@dataclass(frozen=True)
class CommandSpec:
    name: str
    help: str
    configure: ArgumentConfigurator
    handler: CommandHandler


class CommandRegistry:
    def __init__(self) -> None:
        self._commands: dict[str, CommandSpec] = {}

    def command(
        self,
        name: str,
        *,
        help: str,
        configure: ArgumentConfigurator,
    ) -> Callable[[CommandHandler], CommandHandler]:
        command_name = name.strip()
        if not command_name:
            raise ValueError("command name cannot be blank")

        def register(handler: CommandHandler) -> CommandHandler:
            if command_name in self._commands:
                raise ValueError(f"command already registered: {command_name}")
            self._commands[command_name] = CommandSpec(
                name=command_name,
                help=help,
                configure=configure,
                handler=handler,
            )
            return handler

        return register

    def specs(self) -> tuple[CommandSpec, ...]:
        return tuple(self._commands.values())

    def dispatch(self, name: str, args: argparse.Namespace, config: WorkerConfig) -> int:
        return self._commands[name].handler(args, config)


command_registry = CommandRegistry()
