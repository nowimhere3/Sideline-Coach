# SIDELINE COACH SCOUT PLAY REPORT

**SCOUT PLAY ID:** `TTA-Scout-Verify-AntiGravity__2026-09-16_143103_951_MDT`  
**CANONICAL PLAY HASH:** `sha256:ae91bdedb3ca88ac51c158e34a9e0efcb6e1d38f3b9d187d12a402e58fd48312`  
**TASK CLASS:** player-readiness-verification  
**GAME ROOT:** `C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist`  

> This report is reconnaissance, not final architectural authority.

---

### Executive Answer

The exact function that computes message identity in [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) is [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98).
- **Inputs:** Three parameters: `sender`, `text`, and `timestamp`.
- **Return Mechanism:** Computes a 32-bit signed integer polynomial rolling hash (Java `hashCode` / `s[i]*31^(n-1-i)` style using bit shifts `(hash << 5) - hash` forced into a 32-bit integer via `hash |= 0`) over the composite string `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}`, and returns the result as a string (`return String(hash);`).
- **Evidence-Backed Limitation:** The function relies purely on `${sender.trim().toLowerCase()}|${timestamp.trim()}|${text.trim()}` without a unique message identifier or counter. Consequently, two identical messages sent by the same user within the same timestamp period (or when timestamps evaluate to identical coarse/fallback values such as `"Unknown"`, `"Yesterday"`, or identical minute buckets) produce identical hashes, causing deduplication collisions where distinct messages are conflated. Additionally, the function performs direct `.trim()` calls on all three parameters without null/type checks, causing an unhandled `TypeError` if any parameter is `null` or `undefined`.

---

### FACTS
1. In [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98), the function computing message identity is defined on lines 90–98 as:
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
2. The function takes exactly three arguments: `sender`, `text`, and `timestamp`.
3. The return value is the string representation of a 32-bit signed integer (`String(hash)`).
4. [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L172) is invoked on line 172: `const hash = createHash(currentSender, text, currentTimestamp);`, and assigned as the message record identity `id: hash` on line 174.

---

### INFERENCES
1. Because the hash input is strictly composite text (`${sender}|${timestamp}|${text}`) and the timestamp resolution is derived from UI text (e.g. `"Yesterday"`, `"12:30 pm"`, or `"Unknown"` per line 165), duplicate message bodies from the same sender in the same scrape window will collide and be deduplicated erroneously in `existingHashes` (lines 197–208).
2. The 32-bit integer space ($2^{32}$) combined with non-cryptographic polynomial rolling addition increases collision probability across large message corpora compared to standard 64-bit/128-bit hashes or UUIDs.

---

### UNKNOWNS
1. Whether Skool's DOM exposes an immutable server-side message ID (such as a `data-message-id` attribute) that could replace or augment content hashing.

---

### CONTRADICTIONS
- None observed in the bounded function and its callsite.

---

### Relevant Files / Symbols
- File: [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98)
- Symbol: [`createHash`](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L90-L98) (lines 90–98)
- Call Site: [FILE examples/Skool Chat Test.txt](file:///C:/Users/dmcal/Documents/GitHub/Trend%20and%20Tap%20Assist/FILE%20examples/Skool%20Chat%20Test.txt#L172-L178) (lines 172–178)

---

### Recommended Next Step
- Present findings to the runner/lead for review before deciding whether to evaluate DOM attribute availability or alternative composite key hashing strategies.

---

### Provenance
- Inspected file directly at `C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist\FILE examples\Skool Chat Test.txt`.
- Verification completed within read-only reconnaissance constraints.
