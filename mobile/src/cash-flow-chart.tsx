import { View } from "react-native";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";
import { Body, money, useTheme } from "./ui";
export function CashFlowChart({
  flows,
  currency,
}: {
  flows: { account: string; income: number; expense: number }[];
  currency: string;
}) {
  const { colors } = useTheme();
  if (!flows.length) return <Body>No recorded cash flows in this period.</Body>;
  const visible = flows.slice(0, 5);
  if (flows.length > 5)
    visible.push({
      account: "Other accounts",
      income: flows.slice(5).reduce((n, r) => n + r.income, 0),
      expense: flows.slice(5).reduce((n, r) => n + r.expense, 0),
    });
  const total = Math.max(
    visible.reduce((n, r) => n + r.income, 0),
    visible.reduce((n, r) => n + r.expense, 0),
    1,
  );
  const height = 100 + visible.length * 72;
  return (
    <View style={{ gap: 12 }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 330 ${height}`}
        accessible={false}
      >
        <SvgText x={10} y={20} fill={colors.muted} fontSize={12}>
          Income
        </SvgText>
        <SvgText
          x={165}
          y={20}
          fill={colors.muted}
          fontSize={12}
          textAnchor="middle"
        >
          Accounts
        </SvgText>
        <SvgText
          x={320}
          y={20}
          fill={colors.muted}
          fontSize={12}
          textAnchor="end"
        >
          Expenses
        </SvgText>
        {visible.map((r, i) => {
          const y = 60 + i * 72;
          return [
            <Path
              key={`in${i}`}
              d={`M 22 ${height / 2} C 65 ${height / 2} 90 ${y} 124 ${y}`}
              stroke={colors.positive}
              strokeOpacity={0.4}
              strokeWidth={(r.income / total) * 70}
              fill="none"
            />,
            <Path
              key={`out${i}`}
              d={`M 206 ${y} C 240 ${y} 265 ${height / 2} 308 ${height / 2}`}
              stroke={colors.danger}
              strokeOpacity={0.35}
              strokeWidth={(r.expense / total) * 70}
              fill="none"
            />,
            <Rect
              key={`node${i}`}
              x={124}
              y={y - 12}
              width={82}
              height={24}
              rx={6}
              fill={colors.teal}
            />,
            <SvgText
              key={`label${i}`}
              x={165}
              y={y + 4}
              fill="#fff"
              fontSize={9}
              textAnchor="middle"
            >
              {r.account.length > 15 ? r.account.slice(0, 14) + "…" : r.account}
            </SvgText>,
          ];
        })}
        <Rect
          x={12}
          y={height / 2 - 35}
          width={10}
          height={70}
          fill={colors.positive}
          rx={4}
        />
        <Rect
          x={308}
          y={height / 2 - 35}
          width={10}
          height={70}
          fill={colors.danger}
          rx={4}
        />
      </Svg>
      {visible.map((r) => (
        <Body key={r.account}>
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
