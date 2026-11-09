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
                self.chats = [SimpleNamespace(id=1, title='Такси 🚖 Грахово', type='CHAT')]

            def on_start(self):
                def register(fn):
                    self.ready = fn
                    return fn
                return register

            def on_message(self):
                return lambda fn: fn

            def on_typing(self):
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

    def test_expired_qr_is_renewed_in_the_same_login(self):
        flow = worker.RenewingQrAuthFlow(worker.Qr(), worker.Password())
        app = object()
        calls = []
        clock = [100.0]

        async def authenticate(flow, current_app):
            calls.append(current_app)
            if len(calls) == 1:
                clock[0] += 30
                raise RuntimeError('QR authentication expired')
            return 'signed-in'

        with (
            patch.object(worker.QrAuthFlow, 'authenticate', authenticate),
            patch.object(worker.time, 'monotonic', lambda: clock[0]),
        ):
            self.assertEqual(asyncio.run(flow.authenticate(app)), 'signed-in')
        self.assertEqual(calls, [app, app])

    def test_immediate_expiry_still_uses_reconnect_backoff(self):
        flow = worker.RenewingQrAuthFlow(worker.Qr(), worker.Password())
        with patch.object(worker.QrAuthFlow, 'authenticate', side_effect=RuntimeError('QR authentication expired')) as login:
            with self.assertRaisesRegex(RuntimeError, 'QR authentication expired'):
                asyncio.run(flow.authenticate(object()))
            login.assert_awaited_once()

    def test_discovers_additional_groups_and_keeps_the_pinned_id(self):
        pinned = SimpleNamespace(id=50, title='Переименованная группа', type='CHAT')
        dialogs = [
            SimpleNamespace(id=51, title='  гггс ', type='CHAT'),
            SimpleNamespace(id=52, title='Обстановка на районе', type='CHANNEL'),
            SimpleNamespace(id=53, title='ГГГС', type='DIALOG'),
        ]

        async def get_chat(chat_id):
            self.assertEqual(chat_id, 50)
            return pinned

        async def fetch_chats(marker):
            self.assertIsNone(marker)
            return dialogs

        client = SimpleNamespace(chats=[], get_chat=get_chat, fetch_chats=fetch_chats)
        found = asyncio.run(worker.resolve_max_groups(client, [
            {'id': '50', 'title': 'Такси 🚖 Грахово'},
            {'title': 'ГГГС'},
            {'title': 'Обстановка на районе'},
        ]))
        self.assertEqual([chat.id for chat in found], [50, 51, 52])

    def test_private_transport_is_bound_to_account_and_exact_peer(self):
        emissions, sends = [], []
        now = int(worker.time.time() * 1000)

        class Client:
            chats = [
                SimpleNamespace(id=50, title='Такси 🚖 Грахово', type='CHAT'),
                SimpleNamespace(id=51, title='ГГГС', type='CHAT'),
                SimpleNamespace(id=52, title='Обстановка на районе', type='CHAT'),
            ]
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

            def on_typing(self):
                def register(fn):
                    self.typing = fn
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
                                             (4, 100 ^ 200, 100), (5, 100 ^ 300, 300), (6, 777, 200),
                                             (7, 51, 200), (8, 52, 200)]:
                    await self.incoming(SimpleNamespace(id=ident, chat_id=chat, sender=sender, text='message', time=now), self)
                commands.put({'kind': 'send', 'accountId': '100', 'senderId': '200', 'key': 'outdated',
                              'text': 'Лишний ответ', 'sentAt': now - 1})
                await asyncio.sleep(0.2)

            async def close(self):
                pass

        with (
            patch.object(worker, 'WebClient', Client),
            patch.object(worker, 'wait_for_quiet', return_value=True),
            patch.object(worker, 'commands', worker.SimpleQueue()),
            patch.object(worker, 'emit', lambda kind, **values: emissions.append((kind, values))),
            patch.object(worker, 'CONFIG', SimpleNamespace(read_text=lambda **_: worker.json.dumps({
                'maxGroups': [{'title': chat.title} for chat in Client.chats],
            }))),
        ):
            asyncio.run(worker.run())
        self.assertEqual([kind for kind, _ in emissions], ['ready', 'sent', 'message', 'private', 'message', 'message', 'sent'])
        self.assertEqual([data['message']['groupId'] for kind, data in emissions if kind == 'message'], ['50', '51', '52'])
        self.assertEqual(emissions[3][1]['message']['id'], '2')
        self.assertEqual(sends, [(100 ^ 200, 'Привет!')])
        self.assertEqual(emissions[-1][1], {'key': 'outdated', 'ok': False, 'paused': True})

    def test_waits_for_typing_and_skips_a_reply_if_typing_continues(self):
        now = [100.0]
        typing = {1: 103.0}

        async def sleep(seconds):
            now[0] += seconds

        with patch.object(worker.time, 'monotonic', lambda: now[0]), patch.object(worker.asyncio, 'sleep', sleep):
            self.assertTrue(asyncio.run(worker.wait_for_quiet(1, typing)))
            self.assertEqual(now[0], 103.0)
            typing[1] = 120.0
            self.assertFalse(asyncio.run(worker.wait_for_quiet(1, typing)))
            self.assertEqual(now[0], 110.0)


if __name__ == '__main__':
    unittest.main()
