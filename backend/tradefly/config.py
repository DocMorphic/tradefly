from dataclasses import dataclass, field
from pathlib import Path
import os
import json
import re
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
PAPER_URL = 'https://paper-api.alpaca.markets'
DATA_URL = 'https://data.alpaca.markets'
SITE_URL = 'https://tradefly.andustry-0633.chatgpt.site'

@dataclass(frozen=True)
class Settings:
    api_key: str = field(default='', repr=False)
    secret_key: str = field(default='', repr=False)
    bridge_token: str = field(default='', repr=False)
    symbol: str = 'AAPL'
    watchlist: tuple[str,...] = ()
    database: Path = ROOT / 'runs/tradefly.sqlite3'
    brain_dir: Path = ROOT / 'data/brain'
    max_order: str = '100'
    max_exposure: str = '0.10'
    poll_seconds: int = 15

    @classmethod
    def load(cls):
        # Explicit file loading, no browser-prefixed variables, no secret repr.
        local = dotenv_values(ROOT / '.env') if (ROOT / '.env').exists() else {}
        bridge = dotenv_values(ROOT / '.env.bridge') if (ROOT / '.env.bridge').exists() else {}
        symbols=validate_watchlist(json.loads((ROOT/'config/watchlist.json').read_text())['symbols'])
        return cls(watchlist=symbols,api_key=os.getenv('ALPACA_PAPER_API_KEY', local.get('ALPACA_PAPER_API_KEY') or ''),
                   secret_key=os.getenv('ALPACA_PAPER_SECRET_KEY', local.get('ALPACA_PAPER_SECRET_KEY') or ''),
                   bridge_token=bridge.get('TRADEFLY_BRIDGE_TOKEN') or '')

    @property
    def credentials_present(self):
        return bool(self.api_key and self.secret_key)


def validate_watchlist(symbols):
    if not isinstance(symbols,(list,tuple)) or not 1<=len(symbols)<=24:
        raise ValueError('Choose between 1 and 24 stock symbols')
    if any(not isinstance(s,str) or not re.fullmatch(r'[A-Z][A-Z0-9.]{0,9}',s) for s in symbols):
        raise ValueError('Use uppercase stock symbols')
    if len(set(symbols))!=len(symbols): raise ValueError('Stock symbols must be unique')
    return tuple(symbols)
