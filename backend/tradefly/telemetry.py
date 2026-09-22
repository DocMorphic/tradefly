"""Lossless changed-field telemetry. No model, ledger or trade semantics change."""
import gzip
import json

CONTENT_TYPE = 'application/vnd.tradefly.telemetry+gzip'


def difference(previous, current):
    patch = {'set': {}, 'remove': sorted(previous.keys()-current.keys()), 'children': {}}
    for key, value in current.items():
        if key not in previous:
            patch['set'][key] = value
        elif isinstance(value, dict) and isinstance(previous[key], dict):
            child = difference(previous[key], value)
            if any(child.values()): patch['children'][key] = child
        elif value != previous[key]:
            patch['set'][key] = value
    return patch


class Telemetry:
    def __init__(self):
        self.previous = None
        self.receipt = None
        self.uploads = 0
        self.raw_bytes = 0
        self.wire_bytes = 0

    def encode(self, snapshot):
        full = json.dumps(snapshot, separators=(',', ':'), allow_nan=False)
        # Freeze an independent copy; snapshot assembly may mutate dictionaries.
        current = json.loads(full)
        payload = current
        if self.previous is not None and self.receipt:
            payload = {'transport': 'delta-v1', 'base_received_at': self.receipt,
                       'patch': difference(self.previous, current)}
        raw = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
        packed = gzip.compress(raw, compresslevel=6, mtime=0)
        return current, packed, len(full.encode())

    def accepted(self, current, receipt, wire_bytes, raw_bytes):
        self.previous, self.receipt = current, receipt
        self.uploads += 1
        self.raw_bytes += raw_bytes
        self.wire_bytes += wire_bytes

    def reset(self):
        self.previous = self.receipt = None

    def report(self):
        return {'uploads': self.uploads, 'full_snapshot_bytes': self.raw_bytes,
                'sent_bytes': self.wire_bytes,
                'saved_percent': round(100*(1-self.wire_bytes/self.raw_bytes), 2) if self.raw_bytes else 0}
