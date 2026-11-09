"""Private stdout IPC to the parent. Never log incoming messages or credentials."""
import asyncio
import json
import logging
import os
from queue import Empty, SimpleQueue
import random
import sys
from threading import Thread
import time
import unicodedata
from pathlib import Path

from pymax import WebClient, ExtraConfig, QrAuthFlow

ROOT = Path(os.environ['TAXIGR_BRIDGE_HOME'])
CONFIG = ROOT / 'config.json'
commands = SimpleQueue()

def read_commands():
    for line in sys.stdin:
        try:
            command = json.loads(line)
            if isinstance(command, dict):
                commands.put(command)
        except ValueError:
            pass

async def next_command():
    while True:
        try:
            return commands.get_nowait()
        except Empty:
            await asyncio.sleep(0.1)

async def wait_for_quiet(chat_id, typing_until):
    deadline = time.monotonic() + 7
    await asyncio.sleep(1)
    while True:
        now = time.monotonic()
        remaining = typing_until.get(chat_id, 0) - now
        if remaining <= 0:
            return True
        if now >= deadline:
            return False
        await asyncio.sleep(min(remaining, deadline - now, 0.25))

def emit(kind, **values):
    print(json.dumps({'kind': kind, **values}, ensure_ascii=False), flush=True)

class Qr:
    async def show_qr(self, qr_url):
        emit('qr', value=qr_url)

class Password:
    async def get_password(self, hint=None):
        emit('status', value='password_required')
        while True:
            command = await next_command()
            if command.get('kind') == 'password':
                return command.get('password', '')

class RenewingQrAuthFlow(QrAuthFlow):
    async def authenticate(self, app):
        while True:
            started_at = time.monotonic()
            try:
                return await super().authenticate(app)
            except RuntimeError as error:
                # Ordinary QR expiry is part of login, so keep the setup page
                # supplied with a current code. Early failures use normal backoff.
                if str(error) != 'QR authentication expired' or time.monotonic() - started_at < 10:
                    raise

def normalized_title(title):
    return ' '.join(unicodedata.normalize('NFKC', title or '').split()).casefold()

async def resolve_max_groups(current, targets):
    selected = []
    group_types = {'CHAT', 'CHANNEL'}
    chats = {chat.id: chat for chat in (current.chats or []) if chat.type in group_types}
    names = {normalized_title(target['title']) for target in targets if not target.get('id')}
    if names - {normalized_title(chat.title) for chat in chats.values()}:
        # Reconnected sessions may only return an incremental chat list.
        marker = None
        for _ in range(8):
            try:
                page = await current.fetch_chats(marker)
            except Exception:
                break
            chats.update((chat.id, chat) for chat in page if chat.type in group_types)
            if not page or names <= {normalized_title(chat.title) for chat in chats.values()}:
                break
            timestamps = [chat.last_event_time for chat in page if chat.last_event_time > 0]
            if not timestamps or (marker is not None and min(timestamps) >= marker):
                break
            marker = min(timestamps)
    for target in targets:
        pinned = target.get('id')
        if pinned:
            try:
                chat = await current.get_chat(int(pinned))
            except Exception:
                continue
        else:
            matches = [chat for chat in chats.values() if normalized_title(chat.title) == normalized_title(target['title'])]
            if len(matches) != 1:
                continue
            chat = matches[0]
        if chat.type in group_types and chat.id not in {item.id for item in selected}:
            selected.append(chat)
    return selected

async def run():
    global connected_at
    client = WebClient(session_name='max-session.db', work_dir=str(ROOT), auth_flow=RenewingQrAuthFlow(Qr(), Password()),
        extra_config=ExtraConfig(telemetry=False, log_level='CRITICAL', reconnect=False))
    logging.disable(logging.CRITICAL)
    selected = set()
    account_id = None
    watched = {}
    typing_until = {}
    latest_message = {}
    writer = None

    async def write_messages(current):
        while True:
            command = await next_command()
            if command.get('accountId') != account_id:
                continue
            if command.get('kind') == 'watch':
                watched.clear()
                for sender_id, expires in command.get('senders', []):
                    chat_id = current.get_chat_id(int(account_id), int(sender_id))
                    if chat_id not in selected:
                        watched[chat_id] = (str(sender_id), expires)
                for chat_id in latest_message.keys() - watched.keys():
                    del latest_message[chat_id]
            if command.get('kind') == 'send':
                try:
                    sender_id = int(command['senderId'])
                    chat_id = current.get_chat_id(int(account_id), sender_id)
                    if sender_id == int(account_id) or chat_id in selected:
                        raise ValueError('Not a private peer')
                    quiet = await wait_for_quiet(chat_id, typing_until)
                    sent_at = command.get('sentAt')
                    if not quiet or (sent_at is not None and latest_message.get(chat_id, 0) > sent_at):
                        emit('sent', key=command['key'], ok=False, paused=True)
                        continue
                    message = await asyncio.wait_for(current.send_message(chat_id, command['text']), timeout=12)
                    emit('sent', key=command['key'], ok=bool(message and message.id))
                except Exception:
                    emit('sent', key=command['key'], ok=False)

    @client.on_start()
    async def ready(current):
        global connected_at
        nonlocal selected, account_id, writer
        connected_at = time.monotonic()
        config = json.loads(CONFIG.read_text(encoding='utf-8'))
        targets = config.get('maxGroups') or [config.get('groups', {}).get('max') or {'title': 'Такси 🚖 Грахово'}]
        matches = await resolve_max_groups(current, targets)
        selected = {chat.id for chat in matches}
        if len(matches) != len(targets):
            emit('status', value='group_missing')
            return
        me = getattr(current, 'me', None)
        account_id = str(me.contact.id) if me else None
        emit('ready', groups=[{'provider': 'max', 'id': str(chat.id), 'title': chat.title} for chat in matches], accountId=account_id)
        if account_id:
            writer = asyncio.create_task(write_messages(current))

    @client.on_message()
    async def message_received(message, current):
        if not selected or not message.text:
            return
        if current.me and message.sender == current.me.contact.id:
            return
        peer = watched.get(message.chat_id)
        if peer and str(message.sender) == peer[0] and peer[1] > time.time() * 1000:
            latest_message[message.chat_id] = max(latest_message.get(message.chat_id, 0), message.time)
            emit('private', message={'id': str(message.id), 'senderId': peer[0], 'text': message.text, 'sentAt': message.time})
            return
        if message.chat_id not in selected:
            return
        # Only the selected group's new text reaches the parent filter; nothing is posted to source chats.
        emit('message', message={'id': str(message.id), 'groupId': str(message.chat_id),
            'senderId': str(message.sender or ''), 'text': message.text, 'sentAt': message.time})

    @client.on_typing()
    async def typing_received(event, current):
        if not account_id or event.chat_id in selected:
            return
        if event.user_id != int(account_id) and event.chat_id != current.get_chat_id(int(account_id), event.user_id):
            return
        now = time.monotonic()
        for chat_id in [chat_id for chat_id, expiry in typing_until.items() if expiry <= now]:
            del typing_until[chat_id]
        typing_until[event.chat_id] = now + 5

    @client.on_disconnect()
    async def disconnected(exception, reconnect, delay):
        emit('status', value='reconnecting')

    try:
        await client.start()
    finally:
        if writer:
            writer.cancel()
            await asyncio.gather(writer, return_exceptions=True)
        await client.close()

def reconnect_delay(failures, jitter=random.random):
    return min(300, 15 * 2 ** min(failures, 10) * (1 + jitter() * 0.25))

def main():
    global connected_at
    failures = 0
    while True:
        connected_at = None
        try:
            asyncio.run(run())
        except KeyboardInterrupt:
            break
        except Exception as error:
            emit('status', value='reconnecting', error=type(error).__name__)
        # Also wait after a clean disconnect. Otherwise start() returning normally
        # creates a tight reconnect loop. Only a stable connection resets backoff.
        if connected_at is not None and time.monotonic() - connected_at >= 60:
            failures = 0
        emit('status', value='reconnecting')
        time.sleep(reconnect_delay(failures))
        failures += 1

if __name__ == '__main__':
    Thread(target=read_commands, daemon=True).start()
    main()
