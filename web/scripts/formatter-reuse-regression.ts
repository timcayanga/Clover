import assert from 'node:assert/strict';
import { formatCurrencyAmount } from '../lib/currency-format';
import { getCurrencySymbol } from '../lib/currencies';
import { getCalendarDayEndInTimeZone } from '../lib/report-window';

// Compare against fresh Intl instances: precision, symbols and locale output must not change.
for (let repeat = 0; repeat < 2; repeat++) {
  for (const locale of ['en-PH','en-US','de-DE','ar-EG','ja-JP']) {
    for (const currency of ['PHP','USD','EUR','JPY','MIXED']) {
      for (const value of [0,-0,1.005,-1234.56,'9007199254740993.12','0.009',NaN,Infinity]) {
        const amount = new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(value as number);
        const symbol = getCurrencySymbol(currency);
        const prefix = currency === 'MIXED' ? '' : symbol + (symbol.length > 2 && !symbol.endsWith('$') ? ' ' : '');
        assert.equal(formatCurrencyAmount(value,currency,locale),prefix+amount);
      }
    }
  }
}
const times = ['2026-03-08T06:59:59Z','2026-03-08T07:00:00Z','2026-11-01T05:59:59Z','2026-11-01T06:00:00Z','2026-01-31T16:00:00Z'];
for (const zone of ['Asia/Manila','America/New_York','UTC','Pacific/Kiritimati','invalid/timezone']) {
  for (const time of times) {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone==='invalid/timezone'?'UTC':zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
    const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
    const expected=new Date(part('year'),part('month')-1,part('day'),23,59,59,999);
    assert.equal(+getCalendarDayEndInTimeZone(new Date(time),zone),+expected);
  }
}
assert.throws(()=>formatCurrencyAmount(1,'PHP','invalid_locale'),RangeError);
assert.throws(()=>getCalendarDayEndInTimeZone(new Date(NaN),'UTC'),RangeError);
console.log('Formatter reuse preserves decimal precision, locale output, day boundaries and invalid-input behavior.');
