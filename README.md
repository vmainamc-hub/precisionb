# Precision Sentinel + Precision Parity

Standalone Deriv digit-intelligence application containing only the Sentinel/Apex and Precision Parity products plus the runtime infrastructure they require.

## Product surface

- **Sentinel / Apex** — 90-cell observation, psychology, pressure, momentum, liquidity-sweep observation, ranking, governance/vetting, feedback and validated entry-point intelligence.
- **Precision Parity** — even/odd parity analysis and its supporting engines, diagnostics and entry execution intelligence.

## Deliberate exclusions

The standalone application does not expose or ship the unrelated Dashboard, generic Scanner, Precision Trend, Precision Edge product surface, Trading, Auto-Trading, Bot Builder, Bot Library, News, Signals, Analytics, Journal or Settings application routes.

Shared low-level modules remain only where Sentinel or Parity directly depends on them (for example Deriv streaming, account/auth infrastructure, the DBot replay dependency used by Sentinel entry validation, and the pressure substrate used by Sentinel psychology).

## Navigation

Sentinel and Parity are the only product tabs and are presented in the top navigation. There is no application sidebar.
