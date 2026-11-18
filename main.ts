// Deep-dip mean reversion on CBBTC, long only, one position at a time.
//
// How the bot speaks the protocol: the kit shim (vendor/makefun-bars.ts) owns
// the wire for agent-fun/bars-replay/v1. It delivers a hello once, then one
// batch per minute bar, and expects exactly one reply per batch echoing its
// seq, then a done. This file only decides the orders in each reply.
//
// Idea, in one line: BTC falls in short sharp legs and bounces part of the
// way back; buy only a deep dip, sell the bounce, sit in cash otherwise.
// The dev window trends down ~2.8%, so buy-and-hold loses and a bot that
// trades every wiggle bleeds the ~26 bps round-trip cost (4 bps fee + 2 bps
// slippage + ~10 bps price impact each way at full size). The trades have to
// be rare and the move they catch has to be much bigger than that cost.
//
// Entry (on a bar's close, filled at the next bar's open): flat, not in
// warm-up, and the close is at least 118 bps below the highest close of the
// last 130 bars (the current bar included). A 118 bps dip over ~2 hours is
// deep enough that it only fires a few times a day, and only after a real
// leg down, not on ordinary 1-minute noise (per-bar moves are ~7 bps sd).
// Buy the whole cash balance: splitting never pays less impact, and a
// half-size trade would still pay the same fixed bps cost.
//
// Exit (checked on every later bar's close): sell the whole position when
// the close is 95 bps above the actual fill price of the buy, or 80 bps
// below it. The fill price is read back from the batch's fills, not assumed
// from the close, so the take-profit is measured against what was really
// paid (open + slippage + impact + fee). No trailing stop: in the dev data
// trailing exits gave back the bounce; a fixed target banks it.
//
// Risk controls:
// - No entry in the last 180 scored bars: a buy that late would be flattened
//   at the window's last close with no time to bounce, and on dev that one
//   trade cost ~$4.30.
// - max_slippage_bps 200 on every order: a fill more than 2% past the close
//   it was decided on is rejected instead of chased.
// - At most one order per reply, at most one open position, long only, no
//   leverage. Flat bars change nothing (same close, same high) and a missing
//   bar simply adds no close to the history, so gaps cannot fake a dip.
// - Deterministic: no randomness, no wall clock, no network, no files, no
//   environment. The only state is the close history, the rolling high, the
//   entry fill price and a bar counter, so two runs answer identically.

import { runBars, type Bar, type BarsState, type Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Dip window: highest close over this many bars, current bar included. */
const DIP_BARS = 130;
/** Entry when close is this far (bps) below that rolling high. */
const DIP_BPS = 118;
/** Take profit, in bps above the buy's actual fill price. */
const TAKE_PROFIT_BPS = 95;
/** Stop loss, in bps below the buy's actual fill price. */
const STOP_LOSS_BPS = 80;
/** No new entries once this many scored bars have passed. */
const LAST_ENTRY_BAR = 1260;
/** Reject a fill that moved this far (bps) past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 200;

/** Closes seen so far, oldest first, as plain numbers (raw price units). */
const closes: number[] = [];
/** Fill price (raw units) of the open buy, or null when flat. */
let entryFill: number | null = null;
/** Scored bars answered so far (warm-up bars excluded). */
let scoredBars = 0;

function rollingHigh(): number {
  let high = 0;
  const start = closes.length > DIP_BARS ? closes.length - DIP_BARS : 0;
  for (let i = start; i < closes.length; i++) {
    if (closes[i]! > high) high = closes[i]!;
  }
  return high;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    if (!state.warmingUp) scoredBars += 1;

    // Learn the buy's real fill price from this batch's fills before deciding.
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.status === 'filled') {
        if (fill.side === 'buy') entryFill = Number(fill.price);
        if (fill.side === 'sell') entryFill = null;
      }
    }

    const bar: Bar | undefined = batch.bars.find((b) => b.symbol === SYMBOL);
    // A bar with a non-finite or non-positive close carries no price
    // information (a malformed or empty bar): it must not enter the
    // history, or a zero close would fake a bottomless dip on the
    // next bar and trigger a buy on nothing.
    if (bar !== undefined) {
      const c = Number(bar.c);
      if (Number.isFinite(c) && c > 0) closes.push(c);
    }

    const held = state.positions.get(SYMBOL);
    const close = state.close(SYMBOL);

    // Exit first: a held position that hit its target or its stop is sold
    // in full, whatever else the bar says.
    if (held !== undefined && entryFill !== null && close !== null) {
      const retBps = ((Number(close) - entryFill) / entryFill) * 10000;
      if (retBps >= TAKE_PROFIT_BPS || retBps <= -STOP_LOSS_BPS) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // A position whose fill we somehow missed (e.g. a fill reported while
    // this bot was not watching) is never sold blind: without its fill
    // price there is no take-profit to measure, so hold it to the flatten.
    if (held !== undefined) return [];

    // Entry: flat, a fresh bar, early enough in the window, deep dip.
    if (
      bar === undefined ||
      close === null ||
      state.warmingUp ||
      scoredBars > LAST_ENTRY_BAR ||
      closes.length < DIP_BARS ||
      state.cash <= 0n
    ) {
      return [];
    }
    const high = rollingHigh();
    if (high <= 0) return [];
    const dipBps = ((Number(close) - high) / high) * 10000;
    if (dipBps > -DIP_BPS) return [];
    const spend = state.cash;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
