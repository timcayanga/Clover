import { View } from 'react-native';
import Svg, { Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { Text } from './app-text';
import { money, useTheme } from './ui';
import type { AdviserChart } from '../../shared/adviser-chart';
import { savingsColors } from '../../shared/adviser-savings-plan';

export function AdviserSavingsCard({chart}:{chart:AdviserChart}) {
  const {colors}=useTheme(); const p=chart.savingsPlan!; const width=320/p.points.length;
  return <View accessibilityLabel={chart.title} style={{padding:16,borderRadius:20,borderWidth:1,borderColor:colors.line,gap:10}}>
    <Text style={{fontFamily:'Poppins-SemiBold',fontSize:17,color:colors.ink}}>{chart.title}</Text>
    <Text style={{fontFamily:'Poppins-Bold',fontSize:32,color:colors.teal}}>{money(String(p.target),chart.currency)}</Text>
    <Text style={{fontSize:12,color:colors.muted}}>In {p.months} months · Starting with {money(String(p.startingAmount),chart.currency)}</Text>
    <Svg width="100%" height={220} viewBox="0 0 360 235" accessibilityRole="image" accessibilityLabel={`Planned savings reach ${p.target} ${chart.currency} in ${p.months} months`}>
      <Line x1={20} x2={340} y1={197} y2={197} stroke={colors.line}/>
      {p.points.map((point,i)=>{const h=point.amount/p.target*152,x=20+i*width+width*.12;return <G key={point.month}><Rect x={x} y={197-h} width={width*.76} height={h} rx={7} fill={savingsColors[i%savingsColors.length]}/><SvgText x={x+width*.38} y={187-h} fill={colors.ink} fontSize={12} textAnchor="middle">{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(point.amount)}</SvgText><SvgText x={x+width*.38} y={220} fill={colors.muted} fontSize={11} textAnchor="middle">Month {point.month}</SvgText></G>})}
    </Svg>
    <Text style={{fontFamily:'Poppins-SemiBold',fontSize:20,color:colors.teal,textAlign:'center'}}>{money(String(p.monthlyContribution),chart.currency)} each month</Text>
    {p.monthlyBuffer!==null?<Text style={{fontSize:13,color:colors.ink,textAlign:'center'}}>{money(String(Math.abs(p.monthlyBuffer)),chart.currency)} {p.monthlyBuffer<0?'monthly shortfall':'left after bills and this plan'}</Text>:null}
    <Text style={{fontSize:12,color:colors.muted}}>Based on your planning assumptions. No investment returns included. This does not move money or save a goal.</Text>
  </View>;
}
