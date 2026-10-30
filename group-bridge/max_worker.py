"""Private stdout IPC to the parent. Never log incoming messages or credentials."""
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

from pymax import WebClient, ExtraConfig, QrAuthFlow

ROOT = Path(os.environ['TAXIGR_BRIDGE_HOME'])
CONFIG = ROOT / 'config.json'

def emit(kind, **values):
    print(json.dumps({'kind': kind, **values}, ensure_ascii=False), flush=True)

class Qr:
    async def show_qr(self, qr_url):
        emit('qr', value=qr_url)

class Password:
    async def get_password(self, hint=None):
        emit('status', value='password_required')
        line = await asyncio.to_thread(sys.stdin.readline)
        return json.loads(line).get('password', '')

async def run():
    client = WebClient(session_name='max-session.db', work_dir=str(ROOT), auth_flow=QrAuthFlow(Qr(), Password()),
        extra_config=ExtraConfig(telemetry=False, log_level='CRITICAL', reconnect_delay=10))
    logging.disable(logging.CRITICAL)
    selected = None

    @client.on_start()
    async def ready(current):
        nonlocal selected
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
        emit('ready', group={'provider': 'max', 'id': str(selected.id), 'title': selected.title})

    @client.on_message()
    async def message_received(message, current):
        if selected is None or message.chat_id != selected.id or not message.text:
            return
        if current.me and message.sender == current.me.contact.id:
            return
        # Only the selected group's new text reaches the parent filter; nothing is posted to source chats.
        emit('message', message={'id': str(message.id), 'groupId': str(message.chat_id),
            'senderId': str(message.sender or ''), 'text': message.text, 'sentAt': message.time})

    @client.on_disconnect()
    async def disconnected(exception, reconnect, delay):
        emit('status', value='reconnecting')

    await client.start()

while True:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        break
    except Exception as error:
        emit('status', value='reconnecting', error=type(error).__name__)
        time.sleep(15)
