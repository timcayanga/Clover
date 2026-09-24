# My Balance: one monthly Income and Expenses box

User confirmed one converted total per box, not a list of currency amounts.

The Home hero now always renders exactly two boxes, Monthly Income and Monthly Expenses. Both aggregate every transaction currency into the preferred currency used by My Balance. Monthly reports remain separated by currency. This changes presentation only; stored transactions and confirmed amounts are untouched.

The existing dashboard exchange-rate loader supplies rates for the union of balance and transaction currencies. Current and previous month use the same rates before trend calculation. Decimal arithmetic preserves precision and rounds the final total once. A missing required rate produces an unavailable amount/comparison; zero-value currencies do not block a zero total. Extra transaction currencies do not make the separate My Balance amount unavailable.

Figma canonical desktop/mobile Home components already contained exactly two boxes. Updated their descriptions and amount-layer names to explicitly specify one combined total in the preferred currency, never extra currency boxes:
https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1241-59000

Validation: extended the Home balance precision regression with PHP/USD conversion, preferred-currency changes, missing and invalid rates, zero amounts, and large decimal values. Full qa:prepush required before staging deployment.
