import importlib.util
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


if __name__ == '__main__':
    unittest.main()
