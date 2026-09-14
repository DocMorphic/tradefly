from dataclasses import dataclass, field
from pathlib import Path
import os
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
        return cls(api_key=os.getenv('ALPACA_PAPER_API_KEY', local.get('ALPACA_PAPER_API_KEY') or ''),
                   secret_key=os.getenv('ALPACA_PAPER_SECRET_KEY', local.get('ALPACA_PAPER_SECRET_KEY') or ''),
                   bridge_token=bridge.get('TRADEFLY_BRIDGE_TOKEN') or '')

    @property
    def credentials_present(self):
        return bool(self.api_key and self.secret_key)
