# Stage 4D — Phone Field Test: Dad's Instructions

**Written:** 2026-09-23 (America/Edmonton · Calgary, Alberta)
**Status:** Part 1 (client-IP fix, key rotation, spoof check) is done. Waiting on Dad for the real cellular test.

You only do the short steps below. Everything else is handled for you.

---

## Before you start
- Use your **Android phone** with **Chrome**.
- Turn **Wi-Fi OFF** so the phone is on **cellular data only**.
- No VPN. No settings changes. No router. No apps to install.
- The test desktop program is already running on this computer. Leave the computer on and don't close Claude Code.

## Step 1 — Check the secure connection (about 1 minute)
1. In Chrome on the phone, open this address exactly:

   `https://h-re3sz5vmryt3huolfgj6.remote.mysidelinecoach.com/`

2. You should see a plain page with text like:

   `{"success":false,"message":"Unauthorized"}`

3. Tap the padlock in the address bar. It should say the connection is secure, with **no warning page**.

**Reply to Claude:** "phone ready", and tell me what you saw (the text, and whether there was any warning).

That "Unauthorized" message is a **good** result. It means the phone reached your computer securely and your computer correctly refused a stranger.

## Step 2 — Pair the phone (I will give you one line, about 2 minutes)
After you reply "phone ready", I will send you:
- a one-time code, valid for **5 minutes** and usable **once**, and
- a single line to type into Chrome's address bar (it starts with `javascript:`).

Tips for that line:
- Stay on the page from Step 1 first.
- Type the word `javascript:` yourself in lowercase (Chrome removes it if you paste it), then paste the rest.
- Press Go. A small popup should say **200**. If it says anything else, tell me the number.

This is a temporary developer step used only for testing. The finished product will replace it with a simple "Send to Phone" button (Stage 5). You will never do this in the real app.

## Step 3 — Live test (about 12 minutes)
1. Open the same address from Step 1 again. You should now see the Sideline Coach page (or live status), because the phone is paired.
2. **Keep the phone screen on and the page open for about 12 minutes.** Cellular only.
3. During that time I will change a harmless setting on the computer. Tell me if the phone updates by itself, and roughly how quickly.
4. Later I will briefly stop and restart the test program on the computer. The phone page may show "offline" and then come back. Tell me what you see.
5. Near the end I will ask you to turn **Wi-Fi ON, wait a few seconds, then OFF again** (and/or toggle airplane mode for a few seconds), to test switching networks.

## What to tell me
- Anything that looks wrong, slow or confusing, in your own words.
- Whether you had to do anything other than the steps above.

## Safety
- The one-time code is only for this test and is never saved in reports.
- Nothing here changes your real Sideline settings; the test program uses a separate throwaway folder.
- Your phone's network address is never written down.

## Coming next (Claude does these, not Dad)
Security checks against the live relay, a controlled relay restart while the phone is connected, log and resource audit, then the final 4D report.
