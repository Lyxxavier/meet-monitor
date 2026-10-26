# Meet Monitor submission video plan

Prepare two separate videos:

1. A short ReelDiff project showcase generated from the public GitHub repository.
2. A screen recording that demonstrates the running app. ReelDiff does not record app usage.

## 1. ReelDiff project showcase

ReelDiff's README describes a generated 15-30 second video based on a public repository or pull
request: <https://reeldiff.vercel.app>. This project is currently on the
`feature/google-oauth-deploy` branch. A repository URL without a branch or pull request may show
the default branch instead of these latest session-archive changes. Use a ReelDiff pull-request
input after the changes are included in a PR, or generate the repo showcase after the branch is
merged. Do not make the repository public if it contains private data or credentials.

Suggested ReelDiff framing:

- **Headline:** Meet Monitor — clearer class presence, one meeting at a time
- **Tone:** Educational / technical
- **Key points:** Google Meet presence proof of concept; meeting-scoped participant records;
  archived sessions stay reviewable; no audio/video recording
- **Caveat:** Signals are best-effort and are not authoritative attendance proof

The ReelDiff site returned HTTP 404 when checked on 2026-10-26. If it remains unavailable, use
the screen-recorded walkthrough below and retry the showcase link later. Do not install or run
the ReelDiff source project just for this video; its README lists multiple external service
credentials and background services.

## 2. Screen-recorded walkthrough

Use the Windows screen recorder available on the demo computer (for example, Xbox Game Bar with
`Win+Alt+R`, or OBS if already installed). Capture the browser and extension popup; enable the
microphone only if you plan to narrate live. Make a short test recording first to confirm that
the browser, cursor, and microphone are captured. Save the final video as MP4 if the submission
system accepts it.

### Before recording

- Use a test Google account, a test Meet, and test participants who know they are being recorded.
- Share the participant notice before collecting presence. Avoid real class attendance data.
- Start the backend, load the unpacked extension, and verify its backend status is connected.
- Open the professor dashboard and confirm the selected meeting code is the test meeting.
- Close unrelated tabs and notifications. Do not show OAuth secrets, API tokens, `.env` files,
  browser password managers, or private email addresses.
- Test the microphone level and make a brief test recording before the full take.

### Suggested 2-minute narration and shots

| Time | Show | Narration |
|---|---|---|
| 0:00-0:12 | Landing page | “Meet Monitor is a proof of concept for viewing presence signals from a Google Meet session.” |
| 0:12-0:30 | Sign-in page | “Users sign in with Google and choose a student or professor view. This demo does not verify instructor status.” |
| 0:30-0:48 | Extension popup and test Meet | “The extension observes participant tiles and sends names, identifiers, microphone state, and timestamps. It does not record audio or video. Participants are notified before monitoring.” |
| 0:48-1:15 | Professor dashboard | “The professor view is scoped to one meeting session. It shows the latest signals and update time; the overview filters the participant list.” |
| 1:15-1:34 | Switch to an archived session and back | “Ended sessions, or sessions with no updates for 45 seconds, leave the current list but remain selectable as archived records.” |
| 1:34-1:48 | Student view with a test name | “The student view checks only the exact Meet display name entered, so spelling and spacing must match.” |
| 1:48-2:00 | Dashboard or README | “This is an educational demo. Meet’s interface can change, and presence or microphone signals are best-effort—not authoritative attendance proof.” |

Review the finished video before submitting. Check that no secrets, private participant details,
browser notifications, or unintended desktop content are visible or audible.