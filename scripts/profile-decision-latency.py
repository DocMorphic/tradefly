"""Read recorded neural timings without running a brain, calling APIs, or changing the ledger."""
import argparse
import json
import math
from pathlib import Path
import sqlite3
import statistics


def summary(values):
    values = sorted(values)
    if not values: return {'count': 0}
    return {'count': len(values), 'median_seconds': round(statistics.median(values), 4),
            'p90_seconds': round(values[max(0, math.ceil(len(values)*.9)-1)], 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path(__file__).resolve().parents[1]/'runs/tradefly.sqlite3')
    parser.add_argument('--limit', type=int, default=300)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100000:
        parser.error('--limit must be between 1 and 100000')
    with sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro', uri=True) as db:
        rows = [json.loads(r[0]) for r in db.execute('SELECT data FROM decisions ORDER BY rowid DESC LIMIT ?', (args.limit,))]
    simulation, combined, overhead = [], [], []
    for row in rows:
        neural = row.get('neural', {})
        brain = neural.get('wall_seconds')
        total = neural.get('calculation_and_checkpoint_seconds')
        good = lambda n: isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and n >= 0
        if good(brain): simulation.append(brain)
        if good(total): combined.append(total)
        if good(brain) and good(total) and total >= brain: overhead.append(total-brain)
    print(json.dumps({'recorded_decisions':len(rows),
                      'latest_decision_at':rows[0].get('created_at') if rows else None,
                      'simulation':summary(simulation), 'calculation_and_checkpoint':summary(combined),
                      'checkpoint_and_other_overhead':summary(overhead),
                      'scope':'Historical timings, not a new benchmark. Excludes scheduling, queueing, market-data and broker latency. No API calls or ledger writes.'}, indent=2))


if __name__ == '__main__': main()
