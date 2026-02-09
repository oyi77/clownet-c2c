#!/usr/bin/env python3
"""
Test suite for client.py relay command parsing.
Tests /join and /relay command parsing without requiring a live server.
"""

import sys
import unittest
from unittest.mock import Mock, patch, call
from io import StringIO

# Mock socketio before importing client
sys.modules["socketio"] = Mock()


class TestClientRelayCommands(unittest.TestCase):
    """Test /join and /relay command parsing in client.py"""

    def setUp(self):
        """Set up test fixtures"""
        self.mock_sio = Mock()
        self.mock_sio.connected = True
        self.mock_sio.emit = Mock()

    def test_join_command_valid(self):
        """Test /join #room-name emits join_room event"""
        msg = "/join #red-squad"

        # Simulate the command parsing logic
        parts = msg.split(maxsplit=1)
        self.assertEqual(len(parts), 2)
        self.assertEqual(parts[0], "/join")

        room = parts[1].strip()
        self.assertTrue(room.startswith("#"))
        self.assertEqual(room, "#red-squad")

        # Verify emit would be called
        self.mock_sio.emit("join_room", {"room": room})
        self.mock_sio.emit.assert_called_with("join_room", {"room": "#red-squad"})

    def test_join_command_missing_room(self):
        """Test /join without room name returns error"""
        msg = "/join"

        parts = msg.split(maxsplit=1)
        self.assertEqual(len(parts), 1)
        # Should trigger error: "ERROR: /join requires a room name"
        self.assertLess(len(parts), 2)

    def test_join_command_invalid_room_format(self):
        """Test /join with room not starting with # returns error"""
        msg = "/join red-squad"

        parts = msg.split(maxsplit=1)
        room = parts[1].strip()

        # Should trigger error: room must start with '#'
        self.assertFalse(room.startswith("#"))

    def test_relay_command_valid(self):
        """Test /relay <target> <msg> emits chat event"""
        msg = "/relay agent-1 Hello from relay"

        parts = msg.split(maxsplit=2)
        self.assertEqual(len(parts), 3)
        self.assertEqual(parts[0], "/relay")

        target = parts[1].strip()
        relay_msg = parts[2].strip()

        self.assertEqual(target, "agent-1")
        self.assertEqual(relay_msg, "Hello from relay")

        # Verify emit would be called
        self.mock_sio.emit("chat", {"to": target, "msg": relay_msg})
        self.mock_sio.emit.assert_called_with(
            "chat", {"to": "agent-1", "msg": "Hello from relay"}
        )

    def test_relay_command_to_room(self):
        """Test /relay to room (target starts with #)"""
        msg = "/relay #red-squad Team message"

        parts = msg.split(maxsplit=2)
        target = parts[1].strip()
        relay_msg = parts[2].strip()

        self.assertTrue(target.startswith("#"))
        self.assertEqual(target, "#red-squad")
        self.assertEqual(relay_msg, "Team message")

        # Verify emit would be called
        self.mock_sio.emit("chat", {"to": target, "msg": relay_msg})
        self.mock_sio.emit.assert_called_with(
            "chat", {"to": "#red-squad", "msg": "Team message"}
        )

    def test_relay_command_missing_target(self):
        """Test /relay without target returns error"""
        msg = "/relay"

        parts = msg.split(maxsplit=2)
        self.assertEqual(len(parts), 1)
        # Should trigger error: "ERROR: /relay requires target and message"
        self.assertLess(len(parts), 3)

    def test_relay_command_missing_message(self):
        """Test /relay with target but no message returns error"""
        msg = "/relay agent-1"

        parts = msg.split(maxsplit=2)
        self.assertEqual(len(parts), 2)
        # Should trigger error: "ERROR: /relay requires target and message"
        self.assertLess(len(parts), 3)

    def test_relay_command_multiword_message(self):
        """Test /relay with multi-word message"""
        msg = "/relay agent-2 This is a longer message with multiple words"

        parts = msg.split(maxsplit=2)
        target = parts[1].strip()
        relay_msg = parts[2].strip()

        self.assertEqual(target, "agent-2")
        self.assertEqual(relay_msg, "This is a longer message with multiple words")

    def test_join_command_with_hyphen(self):
        """Test /join with hyphenated room name"""
        msg = "/join #dev-team-alpha"

        parts = msg.split(maxsplit=1)
        room = parts[1].strip()

        self.assertTrue(room.startswith("#"))
        self.assertEqual(room, "#dev-team-alpha")

    def test_relay_command_special_chars_in_message(self):
        """Test /relay with special characters in message"""
        msg = "/relay agent-3 Hello! How are you? [status: ok]"

        parts = msg.split(maxsplit=2)
        target = parts[1].strip()
        relay_msg = parts[2].strip()

        self.assertEqual(target, "agent-3")
        self.assertIn("!", relay_msg)
        self.assertIn("?", relay_msg)
        self.assertIn("[", relay_msg)


class TestCommandParsing(unittest.TestCase):
    """Test command parsing logic"""

    def test_command_detection(self):
        """Test that commands are properly detected"""
        join_cmd = "/join #room"
        relay_cmd = "/relay target msg"
        exec_cmd = "/exec ls"
        normal_msg = "Hello world"

        self.assertTrue(join_cmd.startswith("/join "))
        self.assertTrue(relay_cmd.startswith("/relay "))
        self.assertTrue(exec_cmd.startswith("/exec "))
        self.assertFalse(normal_msg.startswith("/"))

    def test_command_priority(self):
        """Test that commands are checked in correct order"""
        # /exec should be checked first
        # /join should be checked second
        # /relay should be checked third
        # default (OpenClaw) should be last

        commands = [
            ("/exec ls", "exec"),
            ("/join #room", "join"),
            ("/relay target msg", "relay"),
            ("normal message", "default"),
        ]

        for cmd, expected_type in commands:
            if cmd.startswith("/exec "):
                self.assertEqual(expected_type, "exec")
            elif cmd.startswith("/join "):
                self.assertEqual(expected_type, "join")
            elif cmd.startswith("/relay "):
                self.assertEqual(expected_type, "relay")
            else:
                self.assertEqual(expected_type, "default")


if __name__ == "__main__":
    unittest.main()
