import assert from 'node:assert/strict';
import { reportChartData } from '../src/report-chart-data.ts';
assert.equal(reportChartData([]), null);
assert.equal(reportChartData([{name:'Empty',points:[{date:'invalid',value:4},{date:'2026-01-01',value:NaN}]}]),null);
const input=[{date:'2026-01-11',value:-10},{date:'2026-01-01',value:20},{date:'2026-01-02',value:0}];
const chart=reportChartData([{name:'Net worth',points:input}]);
assert.deepEqual(chart.series[0].points.map(p=>p.x),[0,0.1,1]);
assert.deepEqual(chart.series[0].points.map(p=>p.value),[20,0,-10]);
assert.equal(input[0].date,'2026-01-11');
assert(chart.min < -10 && chart.max > 20);
for(const value of [0,100,-100]) {
 const single=reportChartData([{name:'One',points:[{date:'2026-01-01',value}]}]);
 assert.equal(single.series[0].points[0].x,0.5);
 assert(Number.isFinite(single.series[0].points[0].y));
 assert(single.max>single.min);
}
const sameScale=reportChartData([{name:'A',points:[{date:'2026-01-01',value:20}]},{name:'B',points:[{date:'2026-01-01',value:20}]}]);
assert.equal(sameScale.series[0].points[0].y,sameScale.series[1].points[0].y);
console.log('PASS report chart dates, signed values, shared scales, invalid inputs and flat histories');
