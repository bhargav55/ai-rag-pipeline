# Protocol Configuration

This document defines the protocol-specific parameters used by the RAG corpus. These values are the source of truth for answers about margin, leverage, trading fees, and liquidation incentives. If these values differ from generic perpetual futures conventions, answers should follow this configuration document.

## Risk parameters

The protocol uses the following baseline risk parameters for standard markets:

- initial margin ratio = 10%
- maintenance margin ratio = 6%
- maximum leverage = 10x
- minimum leverage = 1x

The initial margin ratio controls how much equity a trader needs to open or increase a position. With a 10% initial margin ratio, the highest allowed leverage is 10x.

The maintenance margin ratio controls when an account becomes eligible for liquidation. With a 6% maintenance margin ratio, a 20,000 USDC position must maintain at least 1,200 USDC of account equity before liquidation risk begins.

The maximum leverage is 10x for standard markets. The minimum leverage is 1x, meaning users can trade without borrowing exposure. Riskier assets may use stricter per-market limits, but the baseline protocol configuration is 1x to 10x.

## Fee parameters

The protocol uses the following baseline trading and liquidation fees:

- maker fee = 0.01%
- taker fee = 0.05%
- liquidator fee = 1.00%

The maker fee applies when an order adds liquidity to the book or pool. The taker fee applies when an order removes liquidity or executes immediately against resting liquidity.

The liquidator fee is paid as an incentive to accounts or keepers that liquidate unsafe positions. A 1.00% liquidator fee should be large enough to compensate liquidators during volatile markets while avoiding excessive value extraction from traders.

## How RAG should use this document

For protocol-specific questions, this document should override generic perps knowledge. Good answers should cite the exact parameter and explain how it affects user behavior or risk-engine behavior.

Examples:

- If asked about maintenance margin, answer that the protocol baseline maintenance margin ratio is 6%.
- If asked about fees, answer that the maker fee is 0.01%, the taker fee is 0.05%, and the liquidator fee is 1.00%.
- If asked about leverage, answer that the baseline leverage range is 1x to 10x.
