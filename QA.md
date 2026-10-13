# Verification record

Verified locally on 13 October 2026.

## Automated logic checks

`npm test` passes **28 checks** across four suites:

- Combat: hit timing, combo launch, defense windows, resource limits, boss phase/death, collision substeps and crowd separation.
- Save: checkpoint/settings round trips, corrupted and future schemas, bounds validation, inaccessible storage and quota errors.
- Simulation: coordinated enemies, boss attack variety and resistance to stun-lock, death events, fuel/cooldown, collision, and complete easy/normal fights using public actions.
- Lifecycle: result/pause exits, upgrade navigation, one-time cinematic completion and camera sensitivity.

## Browser checks

`tests/browser.cjs` completed the following in an isolated Chrome session using ordinary UI, keyboard and mouse input. Diagnostic reads did not modify gameplay:

1. Title screen and 900px layout.
2. Settings persistence across reload.
3. Prologue, movement, Pochita interaction, contract and transformation.
4. Pause freezes simulation; click and Escape resume.
5. Natural defeat, death screen and checkpoint retry.
6. Both enemy waves, both boss phases, ending and mission completion.
7. Completion, best rank, trophies and upgrade persistence.
8. Training, defense inputs and return to title.
9. Cached offline reload, then training movement with network disabled.
10. No JavaScript runtime errors and no external asset requests.

The separate `tests/visual.cjs` run used default **high graphics and normal difficulty** at 1440×900, device pixel ratio 1. It completed the fight and allowed the Makima ending to play naturally. The 28 combat samples reported 104 FPS mean, 90 minimum and 103 median on the test machine; median draw calls 212, peak 297. These are local benchmark observations, not a guarantee for other hardware, screen resolutions or browsers.

The in-app browser was also used to inspect the title, exploration and transformation. The narrow title-camera framing was adjusted afterward and inspected separately; gameplay was unchanged by that adjustment. A final facial-surface correction was isolated to character artwork.

Reports and screenshots are under `tests/artifacts/`. Third-party character models were investigated but not included. Known scope limitations are listed in `README.md`.
