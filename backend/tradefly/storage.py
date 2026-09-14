import json
import sqlite3
from pathlib import Path
from .domain import now_iso

class Ledger:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, bar_time TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS orders(client_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, payload TEXT NOT NULL, broker TEXT);
            CREATE TABLE IF NOT EXISTS equity_samples(id INTEGER PRIMARY KEY, at TEXT NOT NULL, equity TEXT NOT NULL, cash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        self.db.commit()
    def close(self): self.db.close()
    def event(self, kind, data):
        with self.db: self.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)', (now_iso(),kind,json.dumps(data)))
    def get(self, key):
        row = self.db.execute('SELECT value FROM settings WHERE key=?',(key,)).fetchone()
        return json.loads(row['value']) if row else None
    def set(self, key, value):
        with self.db: self.db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,json.dumps(value)))
    def has_bar(self, t): return bool(self.db.execute('SELECT 1 FROM decisions WHERE bar_time=?',(t,)).fetchone())
    def decision(self, data):
        with self.db: self.db.execute('INSERT INTO decisions VALUES(?,?,?)',(data['id'],data['bar']['t'],json.dumps(data)))
    def prepare_order(self, client_id, decision_id, payload):
        with self.db: self.db.execute('INSERT INTO orders VALUES(?,?,?,?,NULL)',(client_id,decision_id,'prepared',json.dumps(payload)))
    def update_order(self, client_id, status, broker=None):
        with self.db: self.db.execute('UPDATE orders SET status=?,broker=COALESCE(?,broker) WHERE client_id=?',
                                      (status,json.dumps(broker) if broker is not None else None,client_id))
    def orders(self): return [dict(r) for r in self.db.execute('SELECT * FROM orders ORDER BY rowid')]
    def decisions(self): return [json.loads(r['data']) for r in self.db.execute('SELECT data FROM decisions ORDER BY bar_time')]
    def events(self, limit=100):
        return [{**dict(r),'data':json.loads(r['data'])} for r in self.db.execute('SELECT * FROM events ORDER BY id DESC LIMIT ?',(limit,))]

    def equity_sample(self, equity, cash):
        with self.db: self.db.execute('INSERT INTO equity_samples(at,equity,cash) VALUES(?,?,?)',(now_iso(),str(equity),str(cash)))
    def equity_samples(self):
        return [dict(r) for r in self.db.execute('SELECT at,equity,cash FROM equity_samples ORDER BY id')]
