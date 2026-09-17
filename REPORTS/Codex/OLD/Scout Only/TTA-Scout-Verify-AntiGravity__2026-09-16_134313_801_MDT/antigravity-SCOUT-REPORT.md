This report is reconnaissance, not final architectural authority.

### Executive Answer
The exact function that computes message identity in [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt) is [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98).
- **Inputs**: Three parameters: `sender`, `text`, and `timestamp` (expected strings).
- **Return mechanism**: Computes a 32-bit signed integer hash using a polynomial rolling hash loop (`hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0;`) over the pipe-delimited composite string, and returns the result as a decimal string via `return String(hash);`.
- **Evidence-backed limitation**: The function relies entirely on `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}` without a unique message identifier, sequence counter, or escape mechanism for delimiters. Consequently, identical message text sent by the same sender within the same scraped timestamp window produces an identical hash, causing deduplication collisions. Furthermore, the 32-bit signed integer output space (`hash |= 0`) is susceptible to standard hash collisions, and passing a non-string or `null`/`undefined` value into any argument will cause an unhandled `TypeError` on `.trim()`.

---

### FACTS
1. The function is defined at lines 90–98 in [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) with signature `function createHash(sender, text, timestamp)`.
2. The composite payload is generated at line 91 as `const raw = `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}``;`.
3. The hashing algorithm iterates each character in `raw`, shifting and accumulating into a 32-bit signed integer (`hash |= 0`).
4. The return value is explicitly converted to a string at line 97 (`return String(hash);`).
5. At line 172 inside [`harvestAndSync`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L119-L235), `createHash(currentSender, text, currentTimestamp)` provides the `id` property of each message object in `messageBlocks`, which is subsequently checked against `existingHashes` at line 203 to determine delta synchronization.

---

### INFERENCES
1. Because `createHash` uses a 32-bit integer representation, the hash space is restricted to $2^{32}$ values, which provides lower collision resistance than standard cryptographic hashing algorithms (e.g., SHA-256).
2. If `timestamp` is a relative or low-resolution string (e.g., `"Yesterday"` as extracted in line 165), multiple identical messages within that duration produce identical hash outputs and will be dropped during deduplication (`!existingHashes.has(msg.id)`).

---

### UNKNOWNS
1. Whether Skool's DOM exposes an underlying unique message ID attribute that could replace or augment the composite string in [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) (the file only inspects text nodes and headers).

---

### CONTRADICTIONS
None observed within the bounded scope of [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) and its immediate invocation in [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt).

---

### Relevant Files / Symbols
- [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt)
  - [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) (lines 90–98): Computes message hash identity.
  - [`harvestAndSync`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L119-L235) (lines 172–178, 197–208): Immediate caller and consumer of message `id`.

---

### Recommended Next Step
When authorized to formulate an architectural design or fix, evaluate augmenting [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) with defensive type checks (null-safe trimming), delimiter escaping, and a monotonic message sequence index or higher-precision DOM identifier.

---

### Provenance
- Scout Play ID: `TTA-Scout-Verify-AntiGravity__2026-09-16_134313_801_MDT`
- Canonical Play Hash: `sha256:185e3c796de605eb01ca722b6249701263c42af89e0941fa0a5e1b174618ba1b`
- Target inspected: `FILE examples/Skool Chat Test.txt`
