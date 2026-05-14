# Funding

Perpetual futures use funding payments to keep the mark price close to the underlying spot price. Funding is a periodic cash flow exchanged between long and short traders. It is not paid to the protocol; it transfers value between opposing sides of the market.

## Core idea

When the perp trades above spot, long demand is stronger than short demand. The funding rate is usually positive, so longs pay shorts. This payment makes holding long exposure more expensive and incentivizes traders to short the perp or close long positions.

When the perp trades below spot, short demand is stronger than long demand. The funding rate is usually negative, so shorts pay longs. This makes holding short exposure more expensive and incentivizes traders to buy the perp or close short positions.

## Common formula

A simplified funding payment can be written as:

funding payment = position notional * funding rate

For a 10,000 USDC notional long position and a funding rate of 0.01%, the trader pays 1 USDC for that funding interval. If the rate is -0.01%, the long receives 1 USDC instead.

Production protocols usually calculate funding from a premium index, interest rate component, clamp bounds, and time interval. The exact formula differs between exchanges, but the purpose is the same: reduce persistent divergence between perp and spot prices.

## Mark price vs index price

Funding often depends on the difference between mark price and index price. The index price tracks external spot markets. The mark price is the protocol's fair price used for PnL and liquidation calculations. If mark price is far above index price for a long time, positive funding should increase.

The risk engine should avoid using a manipulable last trade price directly for funding. A manipulated mark price can distort funding payments, trader PnL, and liquidation eligibility.

## Risk engine impact

Funding affects trader account equity. A trader who repeatedly pays funding loses margin over time even if the position entry price has not changed. This means funding can move an account closer to liquidation.

Protocols must apply funding consistently across:

- unrealized PnL
- account equity
- withdrawable balance
- liquidation checks
- insurance fund accounting
- subaccount risk limits

If funding is applied in one accounting path but not another, a trader may withdraw too much collateral or avoid liquidation incorrectly.

## Edge cases

Funding bugs usually appear around timing, sign, and stale state:

- funding rate sign is flipped, causing the wrong side to pay
- funding accrual is skipped before liquidation
- funding is applied twice during position modification
- funding index is updated globally but not settled per account
- funding uses stale oracle prices
- funding rate exceeds intended clamp bounds
- funding can make collateral negative without triggering liquidation

A robust RAG answer about funding should cite the specific funding formula, mention who pays whom, and explain how funding changes account equity.
