"""ACP session/new must succeed even when no LLM provider is configured."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from acp_adapter.session import SessionManager


class DeferredAgentSessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.home = Path(self._tmpdir.name) / ".hermes"
        self.home.mkdir()
        self._old_home = __import__("os").environ.get("HERMES_HOME")
        __import__("os").environ["HERMES_HOME"] = str(self.home)

    def tearDown(self) -> None:
        if self._old_home is None:
            __import__("os").environ.pop("HERMES_HOME", None)
        else:
            __import__("os").environ["HERMES_HOME"] = self._old_home
        self._tmpdir.cleanup()

    def test_create_session_defers_agent_when_no_provider(self) -> None:
        mgr = SessionManager(db=MagicMock())

        def boom(**_kwargs):
            raise RuntimeError(
                "No LLM provider configured. Run `hermes model` to select a provider, "
                "or run `hermes setup` for first-time configuration."
            )

        mgr._make_agent = boom  # type: ignore[method-assign]
        state = mgr.create_session(cwd=str(self.home.parent))
        self.assertTrue(state.session_id)
        self.assertIsNone(state.agent)

    def test_ensure_agent_builds_when_provider_ready(self) -> None:
        mgr = SessionManager(db=MagicMock())
        calls = {"n": 0}

        def factory(**_kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("No LLM provider configured. Run `hermes model`.")
            agent = MagicMock()
            agent.model = "gpt-test"
            return agent

        mgr._make_agent = factory  # type: ignore[method-assign]
        state = mgr.create_session(cwd=str(self.home.parent))
        self.assertIsNone(state.agent)

        agent = mgr.ensure_agent(state)
        self.assertIs(agent, state.agent)
        self.assertEqual(state.model, "gpt-test")

    def test_ensure_agent_reraises_provider_error(self) -> None:
        mgr = SessionManager(db=MagicMock())

        def boom(**_kwargs):
            raise RuntimeError("No LLM provider configured. Run `hermes model`.")

        mgr._make_agent = boom  # type: ignore[method-assign]
        state = mgr.create_session(cwd=str(self.home.parent))
        with self.assertRaisesRegex(RuntimeError, "No LLM provider configured"):
            mgr.ensure_agent(state)


if __name__ == "__main__":
    unittest.main()
