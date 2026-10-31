"""Public decision commitments; matches lib/crypto/receipts.ts byte for byte."""
import hashlib
import json

ZERO_HASH = '0' * 64


def canonical(value):
    def validate(v):
        if v is None or isinstance(v, (str, bool)):
            if isinstance(v, str):
                v.encode('utf-8', errors='strict')
            return
        if isinstance(v, int) and abs(v) <= 9007199254740991:
            return
        if isinstance(v, list):
            for item in v:
                validate(item)
            return
        if isinstance(v, dict) and all(isinstance(k, str) and k.isascii() for k in v):
            for item in v.values():
                validate(item)
            return
        raise ValueError('Receipts require ASCII keys, strings and safe integers; no floats')
    validate(value)
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def receipt(record):
    return {'record': record, 'hash': sha('tradefly.crypto.receipt.v1\n' + canonical(record))}


def merkle_root(hashes):
    if not hashes:
        raise ValueError('Empty commitment')
    level = [sha(b'\x00' + bytes.fromhex(h)) for h in hashes]
    while len(level) > 1:
        level = [sha(b'\x01' + bytes.fromhex(level[i]) + bytes.fromhex(level[min(i + 1, len(level) - 1)]))
                 for i in range(0, len(level), 2)]
    return level[0]


def bundle(receipts):
    if not 1 <= len(receipts) <= 256:
        raise ValueError('A batch needs 1–256 receipts')
    first, last = receipts[0]['record'], receipts[-1]['record']
    previous = first['previous_hash']
    for index, item in enumerate(receipts):
        row = item['record']
        if (row['run_id'] != first['run_id'] or row['source'] != first['source']
                or row['sequence'] != first['sequence'] + index
                or row['previous_hash'] != previous or receipt(row)['hash'] != item['hash']):
            raise ValueError('Receipt chain changed')
        previous = item['hash']
    manifest = {'schema': 'tradefly.crypto.batch.v1', 'run_id': first['run_id'], 'source': first['source'],
                'first_sequence': first['sequence'], 'last_sequence': last['sequence'],
                'previous_hash': first['previous_hash'], 'count': len(receipts),
                'root': merkle_root([r['hash'] for r in receipts])}
    return {'manifest': manifest, 'digest': sha(canonical(manifest)), 'receipts': receipts}
