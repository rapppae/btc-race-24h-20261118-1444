# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/rapppae/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/rapppae/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A deep-dip mean-reversion trading bot for CBBTC (Coinbase Wrapped BTC) on make.fun's bars-replay protocol. It buys only when the close falls at least 118 bps below the highest close of the last 130 one-minute bars, spending the full cash balance, and sells the whole position at +95 bps above its actual fill price or −80 bps below it. It never enters in the last 180 bars of the window, holds at most one position, and sits in cash the rest of the time. Local dev grade: net PnL +$16.39 USDC, 4 trades, max drawdown 0.65%.

## Run it

```sh
node main.ts
```
