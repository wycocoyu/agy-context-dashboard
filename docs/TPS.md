# TPS timing quality

Desktop and IDE share the same calculation. Three separated metrics keep model
decode speed, first-token latency, and end-to-end efficiency aligned with
Antigravity's summary-only telemetry (`chatModel.timeToFirstToken`,
`chatModel.streamingDuration`, `outputTokens`, `thinkingOutputTokens`,
`responseOutputTokens`).

## Metric definitions

- **Streaming Decode Speed (`tps`, `latestTps`, `peakTps`)**:
  - Numerator: total `outputTokens` (falling back to
    `thinkingOutputTokens + responseOutputTokens`, then `responseOutputTokens`
    when totals are absent). Thinking tokens are included because
    `chatModel.streamingDuration` covers thinking and visible response
    streaming together.
  - Session aggregation: token-weighted `sum(outputTokens) / sum(streamingDuration)`
    over qualified requests; never an unweighted arithmetic mean of per-request
    rates.
  - No hardcoded speed ceilings (such as 250 or 600 tok/s) are imposed;
    sustained high-rate streams (`duration >= 1.0s` and `outputTokens >= 30`)
    remain eligible.
- **First-Token Latency (`ttftMedianSeconds`, `latestTtftSeconds`, `ttftSeconds`)**:
  - Source: `chatModel.timeToFirstToken`.
  - Semantics: measures **TTFT** (time to first streamed/thinking token), not
    **TTFAT** (time to first visible answer token), because the host API does
    not expose thinking-end timestamps.
  - Display: session P50 median (`ttftMedianSeconds`, also written to
    backward-compatible `ttftSeconds`) alongside the latest request
    (`latestTtftSeconds`), resisting single-request queue spikes.
- **End-to-End Effective Speed (`e2eTps`)**:
  - Formula: `sum(outputTokens) / sum(ttft + streamingDuration)` over qualified
    requests that also report valid `timeToFirstToken`.
  - Reported separately from pure streaming decode speed; TTFT is never added to
    the pure decode `tps` denominator.
- **Cache accounting**:
  - Normalized input keeps `inputTokens + cacheReadTokens + cacheWriteTokens`,
    preserving `cacheWriteTokens` for Anthropic and Gemini parity.

## Quarantined rates

- Invalid/inconsistent output token scopes (`token-scope`), or conflicting
  duplicate request records (`duplicate-scope`).
- Multiple attempt usage records with differing token counts, when the API
  supplies only one request timing summary (`retry-scope`). A single
  `retryInfos` item is not a retry.
- Strict short-window & low-output quarantine (`short-window`): any sample with
  `streamingDuration < 1.0s` or `outputTokens < 30` is excluded from `peakTps`,
  session weighted `tps`, and `e2eTps`. This blocks buffered bursts and tiny
  single-chunk completions without imposing artificial speed caps.
- Tool-only planner output (`short-tool-window`) with a stream under 1 second,
  TTFT at least 2 seconds, and TTFT at least 20 times the streaming duration.
  Tool-only association requires the generator's step indices; no association is
  inferred from neighboring steps.
- Short samples (`short-outlier`) above `max(8 × median, median + 12 × MAD)` of
  at least five otherwise eligible samples (`duration >= 1s` and
  `outputTokens >= 30`) from the same model, provider and token basis.
- Nonfinite calculated rates (`nonfinite-rate`).

Sustained high rates (`duration >= 1.0s` and `outputTokens >= 30`) remain
eligible even when above the same-model baseline; they receive a warning
(`rateWarnings`). No chunk timeline is exposed by the current Antigravity API,
so actual server generation time cannot be recovered for quarantined short
windows.

## Display and persistence

An unreliable latest request shows **Timing uncertain / 计时异常**, never the prior
request's rate. The UI keeps tooltips concise; exclusion counts and reasons
remain numeric diagnostic metadata. Token counts, cache metrics, and TTFT
(latest + P50) are retained even when a sample's rate is quarantined. If no
eligible samples exist, decode and E2E speeds are unknown.

Old saved rates (`rateVersion !== 3`) are masked as legacy until the full
trajectory can be read and recalculated. Other saved usage survives. Full
coverage recalculations replace prior rates even if fewer samples now qualify.
Partial or regressing host responses do not replace the saved full coverage
snapshot. Only numeric aggregates and fixed reason codes are saved; no prompts,
output/tool arguments, request identifiers or raw trajectory are added to
persisted statistics.

References: DSH discussions
[7960](https://github.com/deepseek-ai/deepseek-harness/discussions/7960) and
[6129](https://github.com/deepseek-ai/deepseek-harness/discussions/6129).
