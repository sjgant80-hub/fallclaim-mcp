# fallclaim-mcp

**MCP server** exposing the [FallClaim SDK](https://github.com/sjgant80-hub/fallclaim-sdk) — a UK claims-firm quantum engine (JC Guidelines PSLA brackets, Civil Liability Act 2018 whiplash tariff, Ogden multipliers, pre-action protocol scheduling, Part 36 assessment, limitation calculator, T0 rule-matched knowledge lookup).

Research aid, not legal advice. Sovereign — no telemetry, no external calls.

## Install & wire into Claude Code

```bash
npm install -g @ai-native-solutions/fallclaim-mcp
claude mcp add fallclaim -- npx -y @ai-native-solutions/fallclaim-mcp
```

Or from source:

```bash
git clone https://github.com/sjgant80-hub/fallclaim-mcp && cd fallclaim-mcp
npm install
claude mcp add fallclaim -- node "$PWD/src/index.js"
```

Restart Claude Code. The server appears under the `fallclaim` prefix.

## Tools

| Tool | What it does |
|---|---|
| `calc_quantum` | Estimate PI quantum: generals + specials + interest, then contributory deduction. |
| `calc_limitation` | Limitation Act 1980 primary date from incident/knowledge + case type. |
| `find_brackets` | Search JC Guidelines (17th ed) PSLA brackets by body part / severity / keyword. |
| `whiplash_tariff` | CLA 2018 s.3 tariff lookup by duration band. |
| `ogden_multiplier` | Ogden 8th ed multiplier for age (lifetime or earnings-to-68). |
| `protocol_schedule` | Pre-action protocol step schedule with dates. |
| `assess_part36` | CPR Part 36 outcome: uplift, indemnity costs, advisory verdict. |
| `ask_t0` | Rule-matched baseline answers for common UK claims questions. |
| `fee_cap` | CFA / DBA fee-cap estimates. |

## Resources

- `fallclaim://reference/case-types`
- `fallclaim://reference/protocols`
- `fallclaim://reference/whiplash`
- `fallclaim://reference/jc-brackets`
- `fallclaim://reference/ogden`
- `fallclaim://reference/t0-rules`
- `fallclaim://meta`

## Example (Claude Code)

```
> Use fallclaim to estimate quantum: RTA, 8k PSLA, 3.5k past special damages, 25% contributory. Incident 2024-01-15.
```

Claude calls `calc_quantum` with those parameters and returns the net figure with a full breakdown.

## Disclaimer

FallClaim is a research aid for UK claims firms (CMC and solicitor practices). Not court filing software. Verify all citations, current whiplash tariff, JC edition, Ogden discount rate, and CPR wording against primary sources before use. Not legal advice.

## License

MIT — © AI-Native Solutions.
