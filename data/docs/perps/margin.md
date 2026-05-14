# Margin

Margin is collateral posted by a trader to support leveraged positions. In a perpetual futures protocol, margin determines whether a trader can open a position, increase leverage, withdraw collateral, or survive adverse price movement.

## Initial margin

Initial margin is the minimum collateral required to open or increase a position. It protects the protocol by ensuring a trader has enough equity at trade entry.

A simplified formula is:

initial margin requirement = position notional * initial margin ratio

If a trader opens a 20,000 USDC position with a 10% initial margin ratio, they need at least 2,000 USDC of account equity. The implied maximum leverage is 10x.

Protocols may use higher initial margin requirements for larger positions, illiquid markets, or assets with volatile oracle prices. This is often implemented with risk tiers.

## Maintenance margin

Maintenance margin is the minimum collateral required to keep a position open. It is usually lower than initial margin. If account equity falls below maintenance margin, the position becomes eligible for liquidation.

A simplified formula is:

maintenance margin requirement = position notional * maintenance margin ratio

If a trader has a 20,000 USDC position and the maintenance margin ratio is 5%, the account must maintain at least 1,000 USDC of equity.

## Account equity

Account equity is the value used by the risk engine to determine solvency. A simplified view is:

account equity = collateral + unrealized PnL - pending fees - funding owed

Some protocols also include realized PnL, unsettled funding, borrow interest, referral rebates, or isolated margin adjustments. The important rule is that every path that changes account value must be reflected before risk checks.

## Cross margin vs isolated margin

In cross margin, all collateral in the account can support all positions. Profit from one market can offset loss in another market. Cross margin improves capital efficiency but creates correlated liquidation risk.

In isolated margin, collateral is assigned to a specific position or market. Losses are contained to that isolated position. This reduces contagion between positions but requires traders to manage collateral per position.

## Withdrawals and risk checks

Withdrawals must run the same margin checks as position increases. If a trader withdraws collateral, account equity falls. The protocol should reject withdrawals that would make the account fall below initial or maintenance requirements.

A common bug is checking margin only during trade execution but not during collateral withdrawal, funding settlement, or fee deduction.

## Risk tiers

Large positions often require more margin than small positions because they are harder to liquidate safely. A risk tier system can increase margin ratios as notional exposure grows.

For example:

- tier 1: up to 50,000 USDC notional, 10% initial margin
- tier 2: 50,000 to 250,000 USDC notional, 15% initial margin
- tier 3: above 250,000 USDC notional, 25% initial margin

Risk tiers help reduce bad debt during volatile markets.

## What RAG should retrieve

For margin questions, the RAG system should retrieve definitions of initial margin, maintenance margin, account equity, and withdrawal checks. Good answers should explain the difference between opening-position requirements and liquidation requirements.
