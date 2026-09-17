### Executive answer

The function that computes message identity in [`FILE examples/Skool Chat Test.txt`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) is [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98).
- **Inputs**: Three parameters: `sender`, `text`, and `timestamp`.
- **Return Mechanism**: Returns a string (`String(hash)`) representing a 32-bit signed integer computed using a bitwise hash accumulation loop (`((hash << 5) - hash) + raw.charCodeAt(i)` and `hash |= 0`).
- **Evidence-Backed Limitation**: The function relies on a simple 32-bit non-cryptographic rolling hash (djb2 variant) constrained to a 32-bit signed integer space (`hash |= 0`), which carries an inherent risk of hash collisions across larger message sets. Additionally, because it executes `.trim()` and `.toLowerCase()` directly on all three parameters without null/type checks, passing a non-string or `null`/`undefined` argument will trigger an unhandled runtime `TypeError`.

---

### FACTS
1. **File Location & Identity**: The function is declared at lines 90–98 of [`FILE examples/Skool Chat Test.txt`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98).
2. **Function Signature**: `function createHash(sender, text, timestamp)` takes three positional parameters.
3. **Delimiter & String Construction**: The function formats a raw composite string as:
   ```javascript
   const raw = `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}`;
   ```
4. **Computation Algorithm**:
   - Initializes `hash = 0`.
   - Iterates character-by-character over `raw`:
     ```javascript
     hash = ((hash << 5) - hash) + raw.charCodeAt(i);
     hash |= 0;
     ```
5. **Return Mechanism**: Returns `String(hash)`, casting the final 32-bit integer into a string.
6. **Invocation**: The only call site in the file is line 172 within `harvestAndSync`:
   ```javascript
   const hash = createHash(currentSender, text, currentTimestamp);
   ```
   and its returned value is assigned to the `id` field of a message object (`id: hash`, line 174), which is subsequently used for set deduplication (`existingHashes.has(msg.id)`, line 203).

---

### INFERENCES
1. **Collision Susceptibility**: Because the hash output is limited to a 32-bit signed integer space (~4.29 billion values), collision probability grows rapidly with volume (birthday bound around ~77,000 items), meaning two distinct messages could yield the identical ID and cause false deduplication drops during sync.
2. **Deterministic Identifier vs. Semantic Identity**: Identical text sent by the same user with the same timestamp string will produce identical hashes; if a user intentionally sends the exact same message multiple times within the same scraped timestamp window, subsequent instances will collide and be dropped by the delta deduplication set.

---

### UNKNOWNS
1. **Collision Rate in Production**: The actual runtime collision rate in active usage cannot be determined solely from static analysis of this test script without telemetry or stored dataset samples.
2. **Caller Guarantee of Input Types**: Whether callers outside of line 172 could ever invoke [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) with `undefined` or `null` values is unknown from the bounded scope.

---

### CONTRADICTIONS
- None observed within the bounded function and its direct call site.

---

### Relevant files / symbols
- [`FILE examples/Skool Chat Test.txt`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt)
  - [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) (lines 90–98): Computes message hash ID.
  - [`harvestAndSync`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L119-L235) (lines 172–174): Direct consumer that assigns the hash to `messageBlocks.id`.

---

### Recommended next step
Evaluate whether replacing the 32-bit rolling hash with a wider or collision-resistant digest (such as `crypto.subtle.digest('SHA-256', ...)` or a 64-bit composite hash) and adding input validation guards is required for message identity reliability in production sync.

---

### Provenance
- Scout Play ID: `TTA-Scout-Verify-AntiGravity__2026-09-16_142907_739_MDT`
- Canonical Play Hash: `sha256:8e68ed7b2e4a0d9b32f24c09fd8ef6350dd5fb59e0762f936c2a1dda14acf919`
- Source File Inspected: `FILE examples/Skool Chat Test.txt`

> This report is reconnaissance, not final architectural authority.
