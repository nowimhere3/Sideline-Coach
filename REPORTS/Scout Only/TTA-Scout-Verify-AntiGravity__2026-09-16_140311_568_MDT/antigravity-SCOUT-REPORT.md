# Reconnaissance Report

**Required Statement:**  
> This report is reconnaissance, not final architectural authority.

---

### Executive Answer
In [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98), the exact function that computes message identity is [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98).
- **Inputs:** `(sender, text, timestamp)`
- **Return Mechanism:** Computes a 32-bit signed integer via bitwise operations (`hash |= 0`) over the concatenated string and returns its string representation via `String(hash)`.
- **Evidence-Backed Limitation:** The function generates a deterministic hash strictly from `sender`, `timestamp`, and `text` without an external unique identifier, monotonic counter, or sequence index. Consequently, two identical messages sent by the same user within the same timestamp window produce identical hashes, causing collision and deduplication/loss during sync (lines 202–208). Furthermore, it relies on a non-cryptographic 32-bit integer space subject to hash collisions across large message sets.

---

### FACTS
1. **File Location & Identity Function:** [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) defines `createHash(sender, text, timestamp)`:
   ```javascript
   function createHash(sender, text, timestamp) {
     const raw = `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}`;
     let hash = 0;
     for (let i = 0; i < raw.length; i++) {
       hash = ((hash << 5) - hash) + raw.charCodeAt(i);
       hash |= 0;
     }
     return String(hash);
   }
   ```
2. **Inputs:** Three positional arguments: `sender`, `text`, and `timestamp`.
3. **Internal String Construction:** Creates template literal `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}`.
4. **Return Mechanism:** Iterates character-by-character accumulating `((hash << 5) - hash) + raw.charCodeAt(i)`, applies 32-bit integer truncation `hash |= 0`, and returns `String(hash)`.
5. **Consumption in Message Pipeline:** At line 172, `const hash = createHash(currentSender, text, currentTimestamp);` is invoked, and `hash` is directly assigned as `id: hash` in message objects (line 174), which are deduplicated against `existingHashes = new Set(existingThread?.messages?.map(m => m.id) || [])` (lines 197–208).

---

### INFERENCES
1. **Collision on Identical Messages:** Because neither DOM order nor a message UUID/timestamp-millisecond timestamp is incorporated, duplicate text sent consecutively within the same scraped timestamp period (e.g., "Yesterday" or "10:15 am") will produce identical IDs and be discarded by `existingHashes.has(msg.id)` at line 203.
2. **Crash Surface on Falsy/Non-String Inputs:** The function calls `.trim()` directly on all three parameters (`sender`, `timestamp`, `text`) without null/type checks. If any parameter evaluates to `null` or `undefined`, a runtime `TypeError` will be thrown.
3. **Small Hash Space:** A 32-bit signed integer provides at most $2^{32}$ possible values, making hash collisions plausible as message volume increases.

---

### UNKNOWNS
1. Whether Skool’s DOM provides a persistent, unique message ID (e.g., in a data attribute) that could replace content-based synthetic hashing.
2. How often identical messages are sent within identical timestamp buckets in production usage.

---

### CONTRADICTIONS
- None observed within the bounded scope of `createHash` and its immediate caller.

---

### Relevant Files / Symbols
- File: [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt)
  - Symbol: [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) (lines 90–98)
  - Caller: `harvestAndSync` (lines 172–178, 197–208)

---

### Recommended Next Step
- If deduplication reliability is addressed in a subsequent phase, inspect the DOM structure of Skool chat messages to determine whether native message IDs or higher-resolution timestamps exist, or incorporate sequence indices / robust hashing (e.g., SHA-256 or UUIDs).

---

### Provenance
- **Scout Play ID:** `TTA-Scout-Verify-AntiGravity__2026-09-16_140311_568_MDT`
- **Canonical Play Hash:** `sha256:6631a9689134142a99981432b79009e2d571343924f7a44d67537dc91bca6e66`
- **Inspected Path:** `FILE examples/Skool Chat Test.txt` (lines 90–98)
