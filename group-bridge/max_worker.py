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

async def run():
    global connected_at
    client = WebClient(session_name='max-session.db', work_dir=str(ROOT), auth_flow=QrAuthFlow(Qr(), Password()),
        extra_config=ExtraConfig(telemetry=False, log_level='CRITICAL', reconnect=False))
    logging.disable(logging.CRITICAL)
    selected = None
    account_id = None
    watched = {}
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
                    if chat_id != selected.id:
                        watched[chat_id] = (str(sender_id), expires)
            if command.get('kind') == 'send':
                try:
                    sender_id = int(command['senderId'])
                    chat_id = current.get_chat_id(int(account_id), sender_id)
                    if sender_id == int(account_id) or chat_id == selected.id:
                        raise ValueError('Not a private peer')
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
        pinned = config.get('groups', {}).get('max', {}).get('id')
        if pinned:
            # A restored session returns incremental sync, often without unchanged chats.
            # Fetch the already approved ID directly instead of selecting another title.
            try:
                matches = [await current.get_chat(int(pinned))]
            except Exception:
                emit('status', value='group_lookup_error')
                return
        else:
            matches = [chat for chat in (current.chats or []) if
                (chat.title or '').strip().casefold() == 'такси 🚖 грахово']
        if len(matches) != 1:
            emit('status', value='group_missing')
            return
        selected = matches[0]
        me = getattr(current, 'me', None)
        account_id = str(me.contact.id) if me else None
        emit('ready', group={'provider': 'max', 'id': str(selected.id), 'title': selected.title}, accountId=account_id)
        if account_id:
            writer = asyncio.create_task(write_messages(current))

    @client.on_message()
    async def message_received(message, current):
        if selected is None or not message.text:
            return
        if current.me and message.sender == current.me.contact.id:
            return
        peer = watched.get(message.chat_id)
        if peer and str(message.sender) == peer[0] and peer[1] > time.time() * 1000:
            emit('private', message={'id': str(message.id), 'senderId': peer[0], 'text': message.text, 'sentAt': message.time})
            return
        if message.chat_id != selected.id:
            return
        # Only the selected group's new text reaches the parent filter; nothing is posted to source chats.
        emit('message', message={'id': str(message.id), 'groupId': str(message.chat_id),
            'senderId': str(message.sender or ''), 'text': message.text, 'sentAt': message.time})

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
