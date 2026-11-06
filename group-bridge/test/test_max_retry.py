import importlib.util
import asyncio
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault('TAXIGR_BRIDGE_HOME', str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('max_worker', Path(__file__).parents[1] / 'max_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class RetryTest(unittest.TestCase):
    def check_reconnects(self, fail):
        attempts, delays, closes = [], [], []
        clock = [100.0]

        class Client:
            def __init__(self, **kwargs):
                self.extra = kwargs['extra_config']
                self.chats = [SimpleNamespace(id=1, title='Такси 🚖 Грахово')]

            def on_start(self):
                def register(fn):
                    self.ready = fn
                    return fn
                return register

            def on_message(self):
                return lambda fn: fn

            def on_disconnect(self):
                return lambda fn: fn

            async def start(self):
                attempts.append(clock[0])
                assert not self.extra.reconnect  # Only one retry loop owns timing.
                if fail:
                    raise ConnectionError('offline')
                await self.ready(self)

            async def close(self):
                closes.append(True)

        def sleep(delay):
            delays.append(delay)
            clock[0] += delay
            if len(delays) == 7:
                raise KeyboardInterrupt

        with patch.object(worker, 'WebClient', Client), patch.object(worker, 'emit'), \
             patch.object(worker, 'CONFIG', SimpleNamespace(read_text=lambda **_: '{"groups":{}}')), \
             patch.object(worker.time, 'monotonic', lambda: clock[0]), \
             patch.object(worker.time, 'sleep', sleep):
            with self.assertRaises(KeyboardInterrupt):
                worker.main()
        self.assertEqual(len(attempts), 7)
        self.assertEqual(len(closes), 7)
        for actual, minimum in zip(delays, [15, 30, 60, 120, 240, 300, 300]):
            self.assertGreaterEqual(actual, minimum)
            self.assertLessEqual(actual, min(300, minimum * 1.25))

    def test_clean_disconnect_cannot_loop_without_delay(self):
        self.check_reconnects(False)

    def test_repeated_connection_errors_back_off(self):
        self.check_reconnects(True)

    def test_private_transport_is_bound_to_account_and_exact_peer(self):
        emissions, sends = [], []
        now = int(worker.time.time() * 1000)

        class Client:
            chats = [SimpleNamespace(id=50, title='Такси 🚖 Грахово')]
            me = SimpleNamespace(contact=SimpleNamespace(id=100))

            def __init__(self, **kwargs):
                pass

            def on_start(self):
                def register(fn):
                    self.ready = fn
                    return fn
                return register

            def on_message(self):
                def register(fn):
                    self.incoming = fn
                    return fn
                return register

            def on_disconnect(self):
                return lambda fn: fn

            @staticmethod
            def get_chat_id(first, second):
                return first ^ second

            async def send_message(self, chat_id, text):
                sends.append((chat_id, text))
                return SimpleNamespace(id=42)

            async def start(self):
                await self.ready(self)
                commands = worker.commands
                commands.put({'kind': 'watch', 'accountId': '100', 'senders': [['200', now + 60_000], ['300', now - 1]]})
                commands.put({'kind': 'send', 'accountId': '777', 'senderId': '200', 'key': 'old', 'text': 'old'})
                commands.put({'kind': 'send', 'accountId': '100', 'senderId': '200', 'key': 'current', 'text': 'Привет!'})
                await asyncio.sleep(0.2)
                for ident, chat, sender in [(1, 50, 200), (2, 100 ^ 200, 200), (3, 100 ^ 200, 300),
                                             (4, 100 ^ 200, 100), (5, 100 ^ 300, 300), (6, 777, 200)]:
                    await self.incoming(SimpleNamespace(id=ident, chat_id=chat, sender=sender, text='message', time=now), self)

            async def close(self):
                pass

        with (
            patch.object(worker, 'WebClient', Client),
            patch.object(worker, 'commands', worker.SimpleQueue()),
            patch.object(worker, 'emit', lambda kind, **values: emissions.append((kind, values))),
            patch.object(worker, 'CONFIG', SimpleNamespace(read_text=lambda **_: '{"groups":{}}')),
        ):
            asyncio.run(worker.run())
        self.assertEqual([kind for kind, _ in emissions], ['ready', 'sent', 'message', 'private'])
        self.assertEqual(emissions[-1][1]['message']['id'], '2')
        self.assertEqual(sends, [(100 ^ 200, 'Привет!')])


if __name__ == '__main__':
    unittest.main()
