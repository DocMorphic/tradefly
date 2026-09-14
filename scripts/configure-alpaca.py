"""Save paper credentials locally without echoing them or putting them in shell history."""
from getpass import getpass
from pathlib import Path
import os

root = Path(__file__).resolve().parents[1]
path = root / '.env'
if path.exists():
    raise SystemExit('A .env file already exists. Edit it locally instead of overwriting it.')
print('Use the keys from Alpaca’s PAPER dashboard. Input is hidden.')
key = getpass('Paper API key: ').strip()
secret = getpass('Paper secret key: ').strip()
if not key or not secret or any(c in key + secret for c in '\r\n\x00'):
    raise SystemExit('Both values are required and must be single-line.')
fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(f'ALPACA_PAPER_API_KEY={key}\nALPACA_PAPER_SECRET_KEY={secret}\n')
print('Saved in Tradefly’s ignored .env file. No credentials were sent to chat.')
