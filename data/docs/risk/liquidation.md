# Liquidation

Liquidation closes or reduces positions when account equity falls below maintenance margin. It is the protocol's mechanism for preventing insolvent accounts from accumulating losses that exceed their collateral.

## Liquidation condition

A simplified liquidation condition is:

account equity < maintenance margin requirement

Account equity should include collateral, unrealized PnL, settled and unsettled funding, trading fees, borrow fees, and any other balance-changing values. Maintenance margin is usually based on current position notional and a maintenance margin ratio.

If the protocol calculates equity using stale funding or stale oracle prices, liquidation can happen too early or too late.

## Full vs partial liquidation

A full liquidation closes the entire position. It is simple but can be harsh for traders and may cause unnecessary market impact.

A partial liquidation reduces the position until the account returns to a safer margin level. It is more complex but usually better for large positions. Partial liquidation requires careful handling of residual position size, fees, and updated margin requirements after each reduction.

## Liquidation price

The liquidation price is the approximate market price where account equity reaches the maintenance margin requirement. It depends on entry price, position size, collateral, funding, fees, and maintenance margin ratio.

Liquidation price should be treated as an estimate. Real execution may differ because of oracle updates, slippage, funding accrual, and partial liquidation rules.

## Liquidator incentives

Liquidators need an incentive to close risky positions quickly. Protocols commonly pay a liquidation fee or discount. The incentive must be large enough to attract liquidators but not so large that it unnecessarily harms traders.

If the liquidation reward is too small, risky accounts may remain open during volatile markets. If it is too large, liquidators may extract excessive value from traders.

## Insurance fund and bad debt

Bad debt occurs when a position cannot be closed before losses exceed collateral. An insurance fund can absorb bad debt and protect winning traders from socialized losses.

The liquidation engine should update the insurance fund after liquidation and clearly account for any shortfall. Bad debt accounting must not silently mint value, hide losses, or leave the system with inconsistent balances.

## Oracle and latency risk

Liquidation depends heavily on the oracle or mark price. If the oracle is stale, manipulated, or delayed, accounts may appear solvent when they are insolvent. During fast markets, a delay of even a few seconds can increase bad debt.

Protocols should use freshness checks, confidence bounds, circuit breakers, and fallback behavior for suspicious price updates.

## Common liquidation bugs

Security reviews should look for:

- equity calculation excludes funding or fees
- liquidation check uses index price but PnL uses mark price
- partial liquidation does not re-check account health
- liquidation reward can exceed remaining collateral
- stale oracle price allows undercollateralized accounts to survive
- bad debt is not recorded correctly
- liquidator can choose parameters that create unfair profit
- rounding lets accounts avoid liquidation at the boundary

A good RAG answer about liquidation should cite the maintenance margin condition, explain account equity, and mention oracle latency and bad debt risk when relevant.
