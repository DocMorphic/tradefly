"""Optional loopback-only read-only API; controls go through the authenticated desktop."""
import json
from fastapi import FastAPI, HTTPException
from .config import Settings
app=FastAPI(title='Tradefly local telemetry',docs_url=None,redoc_url=None)
@app.get('/health')
def health(): return {'service':'tradefly','mode':'paper-only'}
@app.get('/status')
def status():
    p=Settings.load().database.parent/'status.json'
    if not p.exists(): raise HTTPException(503,'Worker has not published a status yet')
    return json.loads(p.read_text())
