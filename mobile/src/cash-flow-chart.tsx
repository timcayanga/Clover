import { useState } from "react";
import { cashFlowLayout, flowBand } from "./cash-flow-layout";
import { View } from "react-native";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";
import { Body, money, useTheme } from "./ui";
export function CashFlowChart({
  flows,
  currency,
}: {
  flows: { account: string; income: number; expense: number }[];
  currency: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(330);
  const left = width * .38, right = width * .62, end = width - 22;
  const layout = cashFlowLayout(flows);
  if (!layout) return <Body>No recorded cash flows in this period.</Body>;
  const { nodes, height, top, incomeHeight, expenseHeight } = layout;
  return (
    <View onLayout={event => setWidth(Math.max(220, event.nativeEvent.layout.width))} style={{ gap: 12 }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessible={false}
      >
        <SvgText x={10} y={20} fill={colors.muted} fontSize={12}>
          Income
        </SvgText>
        <SvgText
          x={width / 2}
          y={20}
          fill={colors.muted}
          fontSize={12}
          textAnchor="middle"
        >
          Accounts
        </SvgText>
        <SvgText
          x={width - 10}
          y={20}
          fill={colors.muted}
          fontSize={12}
          textAnchor="end"
        >
          Expenses
        </SvgText>
        {nodes.map((row, i) => (
          <G key={`${row.account}-${i}`}>
            {row.incomeHeight > 0 ? <Path d={flowBand(22, left, row.incomeY, row.y, row.incomeHeight)} fill={colors.positive} fillOpacity={0.4} /> : null}
            {row.expenseHeight > 0 ? <Path d={flowBand(right, end, row.y, row.expenseY, row.expenseHeight)} fill={colors.danger} fillOpacity={0.35} /> : null}
            <Rect x={left} y={row.y} width={right - left} height={row.height} rx={Math.min(4, row.height / 2)} fill={colors.teal} />
            <SvgText x={width / 2} y={row.height >= 20 ? row.y + row.height / 2 + 3 : row.y + row.height + 13} fill={row.height >= 20 ? "#fff" : colors.ink} fontSize={10} textAnchor="middle">
              {row.account.length > 15 ? row.account.slice(0, 14) + "…" : row.account}
            </SvgText>
          </G>
        ))}
        {incomeHeight > 0 ? <Rect x={12} y={top} width={10} height={incomeHeight} fill={colors.positive} rx={Math.min(4, incomeHeight / 2)} /> : null}
        {expenseHeight > 0 ? <Rect x={end} y={top} width={10} height={expenseHeight} fill={colors.danger} rx={Math.min(4, expenseHeight / 2)} /> : null}
      </Svg>
      {nodes.map((r, index) => (
        <Body key={`${r.account}-${index}`}>
          {r.account}: {money(String(r.income), currency)} in ·{" "}
          {money(String(r.expense), currency)} out
        </Body>
      ))}
      <Body>
        Recorded income and expenses by account. Different totals can reflect
        existing balances. Internal transfers are excluded.
      </Body>
    </View>
  );
}
