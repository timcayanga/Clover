# Travel spending Adviser check

Production demo observations:
- A question asking how much could be spent on a trip was classified as purchase saving, asking for a target price instead of calculating spending room.
- A general spending-room question returned a generic spending-driver answer rather than the requested calculation.

Changes:
- Distinguish spending ceilings from savings targets before matching travel/purchase keywords. Preserve daily spending and purchase-savings flows.
- Use the existing scoped, single-currency spending calculation directly for explicit day/week horizons and an optional extra buffer. Display the components, confidence and missing-data caveats without relying on model narration.
- Unrecognized dates, amounts, income assumptions, negation or mismatched buffer currencies request clarification rather than silently changing the request.
- Cash includes bank, wallet and cash accounts, not credit limits or investment values. The calculation is a conservative estimate; historical reserves may overlap with bills. No changes to confirmed financial records.

Recording prompt: “How much can I spend on a trip over the next 30 days in PHP? Keep an extra PHP 5,000 buffer.” Use the actual returned values and limitations; do not replace them with a preset answer.
