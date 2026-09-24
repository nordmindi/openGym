# Improvement checklist

What "world class" means for openGym: a training log people trust more than Strong or
Hevy, a live session that is faster than a notebook, and one history that works offline
and syncs to a server you run. The progression engine, 1RM, effort stats, and muscle map
are already ahead of most trackers. The gaps below are ordered so each section makes the
next one worth doing.

Check an item only when it ships in a release, not when it is sketched.

## 1. History you can trust

Switching apps fails when the old log looks thinner after import.

- [x] Exercise names from FitNotes, Strong, and Hevy match the library, or become a custom exercise the user can correct **once** so every later set of that name follows
- [x] Import summary lists skipped rows and why (blank set, unparseable date, unrecognised columns)
- [x] Re-importing the same file does not duplicate sets
- [x] A day that already has a workout still receives lifts from the file that are not already on that day
- [x] Heatmap covers the whole history, not only the last ~52 weeks
- [x] Days with no recorded duration (typical of FitNotes) are shaded by sets or volume, so they do not look empty
- [x] Imported sessions show up in History with the right date, exercise, weight, reps, and unit
- [x] A round-trip backup (export JSON → import backup) restores plan, workouts, body weight, and settings

## 2. The live session

People stay for the workout screen.

- [x] Plate calculator on the set (bar + plates for the working weight)
- [x] Per-exercise notes, visible while the set is on screen
- [x] Warm-up sets that do not count as the working set for progression or PRs
- [x] Rest timer readable at arm's length: big remaining time, one-tap complete, last weight already filled
- [x] Supersets and timed holds never hide the next field
- [x] Percentage / training-max programming (5/3/1-style) on the existing progression engine
- [x] Starter plans beyond PPL: upper/lower, full body, 5×5
- [x] Effort (RIR / RPE) can influence the next target, not only the charts

## 3. One log on the phone and the server

The Android app (`VITE_MOBILE=1`) never talks to the API. A self-hosted profile never
appears on the sideloaded APK. These are two products until this section is done.

- [ ] Phone keeps `opengym-state.json` as the offline copy
- [ ] Optional "sync to my openGym" using the existing passkey and `/api/data`
- [ ] Conflict rule stated in the UI in one sentence: newest edit wins per workout day, and a day is never deleted silently
- [ ] Offline edits sync when the server is reachable again
- [ ] Sign-out and a failed sync never wipe the local file

## 4. An install you can hand to someone

- [ ] Release APK is signed with a keystore that is kept; every update uses that same key
- [ ] `npm run build:mobile` works on Windows (the Unix `VITE_MOBILE=1` prefix fails in `cmd`)
- [ ] Docs name Java 21 for Gradle (Android Studio's JDK is enough; a system Java 17 is not)
- [ ] `./data` is not readable as plain JSON by anyone who can open the host folder, or the threat is accepted in writing in `SECURITY.md` and left as-is
- [ ] A profile can hold a second passkey, so losing one phone is not losing the account
- [ ] Session secret and VAPID keys are generated on first run and never committed (`data/` stays gitignored)

## 5. Insight, after the log is solid

Do these only once sections 1–3 are boringly reliable.

- [ ] Body measurements (waist, arms, …) next to body weight
- [ ] Weekly review: what progressed, what stalled, which muscles were skipped
- [ ] Exercise instructions in German and Portuguese (UI is translated; the upstream dataset is not)

## Out of scope until the list above is done

Social feed, subscriptions, a generic AI coach, and store listings. openGym stays
self-hosted, AGPL, and free. None of those need to change for the product to feel finished.
