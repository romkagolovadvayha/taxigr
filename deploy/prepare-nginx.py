"""Prepare the release vhost while preserving the installed TLS ingress."""
import argparse
from pathlib import Path
import re


def prepare(template, previous='', forwarded_client=False):
    if re.search(r'^\s*listen [^;]*\bproxy_protocol\b', previous, re.M):
        # The owned TLS gateway forwards to loopback with PROXY protocol.
        # Replacing these listeners with public :443 would bypass that ingress.
        listeners = set(re.findall(
            r'^\s*listen ((?:127\.0\.0\.1:\d+|\[::1\]:\d+) ssl [^;]*\bproxy_protocol);',
            previous, re.M))
        ipv4 = [line for line in listeners if line.startswith('127.')]
        ipv6 = [line for line in listeners if line.startswith('[::1]')]
        if len(ipv4) != 1 or len(ipv6) != 1:
            raise ValueError('Expected one loopback PROXY-protocol TLS listener per address family')
        for old, new in [('443 ssl http2', ipv4[0]), ('[::]:443 ssl http2', ipv6[0])]:
            needle = f'listen {old};'
            if template.count(needle) != 2:
                raise ValueError('Expected website and API TLS listeners in release template')
            template = template.replace(needle, f'listen {new};')
    if forwarded_client:
        anchor = 'server_name api.taxigr.ru;'
        if template.count(anchor) != 1:
            raise ValueError('Expected one API vhost for fallback client forwarding')
        before, after = template.split(anchor, 1)
        for directive in ['proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $remote_addr;']:
            if after.count(directive) != 1:
                raise ValueError('Expected one upstream client header in API vhost')
        after = after.replace('proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Real-IP $taxigr_request_client_ip;', 1)
        after = after.replace('proxy_set_header X-Forwarded-For $remote_addr;', 'proxy_set_header X-Forwarded-For $taxigr_request_client_ip;\n        proxy_set_header X-Taxigr-Proxy-Key "";', 1)
        template = before + anchor + after
    return template


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('template', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--forwarded-client', action='store_true')
    args = parser.parse_args()
    args.output.write_text(prepare(args.template.read_text(), args.previous.read_text() if args.previous else '', args.forwarded_client))
