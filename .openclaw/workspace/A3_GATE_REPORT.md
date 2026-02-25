# A3 Gate Report

> Generated: 2026-02-25T05:48:05.928Z
> Source: `C:\Users\holyd\.openclaw\workspace\OM_ACTIVITY.jsonl`
> Pivot: auto-detected first A2 forecast heartbeat (3f118c74-a337-4807-8f6e-047fa9095e96)
> Heartbeat runs seen: 14

## Cohorts

- Pre: 13 runs
- Post: 1 runs

## Metrics (Pre -> Post)

| Metric | Pre | Post |
|---|---:|---:|
| unknown_path_rate | 7.7% | 0.0% |
| latched_path_rate | 92.3% | 100.0% |
| forecast_prompt_rate | 0.0% | 100.0% |
| forecast_state_rate | 76.9% | 100.0% |
| avg_tool_calls | 1.15 | 2.00 |
| error_rate | 7.7% | 0.0% |
| avg_repeated_path_streak | 1.70 | 2.00 |
| avg_repetition_pressure | 25.83 | 50.00 |
| resting_path_rate | 30.8% | 0.0% |

## Gate Checks

- [PASS] `unknown_path_lt_5pct`: post unknown_path_rate=0.0% (target < 5%)
- [PASS] `forecast_prompt_presence_gt_95pct`: post forecast_prompt_rate=100.0% (target >= 95%)
- [HOLD] `loop_length_not_worse`: pre avg_repeated_path_streak=1.70; post=2.00
- [PASS] `no_error_rate_spike`: pre error_rate=7.7%; post=0.0%
- [PASS] `no_resting_spike`: pre resting_path_rate=30.8%; post=0.0%

## Verdict: HOLD

## Notes
- Pre cohort has 13/20 runs. Baseline may be weak.
- Post cohort has 1/20 runs. Keep collecting heartbeats.

## Run IDs

- Pre: 1927f352-080c-4582-b318-ff08a18cce71, 658601a1-ed77-4c09-9ed7-f87bdef66be4, 080a5f9b-582d-4df1-b372-2c32dcaf6608, 87715543-237f-4ad9-9e66-495b1e32a1d1, ed8b52ac-ecf2-401e-b54f-47194d87a146, f09d4a88-0dd7-47a0-91f9-23f2d4ba5ac2, 2150f7c5-f456-4e50-9409-1bb0ddeefb38, 9ec842d5-e1d6-4dd1-a178-f653a686f8d7, a5c338f7-cc04-479d-8a17-e31bb569598a, 4e33f324-a242-435d-a4f6-a0e5fdbe0b8d, 79e440ab-00e5-4423-b4d1-702774df8b49, c39f3304-0501-4ad1-84f5-e4cc886955fc, 728927bb-fb35-4d5f-904e-a1ef03dee5d3
- Post: 3f118c74-a337-4807-8f6e-047fa9095e96