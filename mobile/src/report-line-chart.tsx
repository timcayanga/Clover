import { useId, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Polygon,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { reportChartData, type ChartPoint } from "./report-chart-data";
import { Body, money, useTheme } from "./ui";

export function ReportLineChart({
  series,
  currency,
}: {
  series: { name: string; color: string; points: ChartPoint[] }[];
  currency: string;
}) {
  const { colors } = useTheme();
  const gradient = useId().replace(/[^a-z0-9]/gi, "");
  const [showValues, setShowValues] = useState(false);
  const chart = reportChartData(series);
  if (!chart) return <Body>No dated history is available yet.</Body>;
  const x = (value: number) => 52 + value * 258;
  const y = (value: number) => 12 + value * 166;
  const date = (value: number) =>
    new Date(value).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <View style={{ gap: 12, minWidth: 0 }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`${series.map((item) => item.name).join(" and ")} in ${currency}, ${date(chart.first)} to ${date(chart.last)}. Expand values for exact amounts.`}
      >
        <Svg width="100%" height={210} viewBox="0 0 320 210">
          <Defs>
            {series.map((item, index) => (
              <LinearGradient
                key={item.name}
                id={`${gradient}${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0" stopColor={item.color} stopOpacity={0.25} />
                <Stop offset="1" stopColor={item.color} stopOpacity={0.02} />
              </LinearGradient>
            ))}
          </Defs>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <ViewGrid
              key={fraction}
              y={y(fraction)}
              label={new Intl.NumberFormat("en-PH", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(chart.max - fraction * (chart.max - chart.min))}
              color={colors.muted}
              line={colors.line}
            />
          ))}
          {chart.series.map((item, index) => {
            const points = item.points
              .map((point) => `${x(point.x)},${y(point.y)}`)
              .join(" ");
            const first = item.points[0],
              last = item.points[item.points.length - 1];
            if (!first || !last) return null;
            return (
              <G key={item.name}>
                {item.points.length > 1 ? (
                  <Polygon
                    points={`${x(first.x)},178 ${points} ${x(last.x)},178`}
                    fill={`url(#${gradient}${index})`}
                  />
                ) : null}
                <Polyline
                  points={points}
                  fill="none"
                  stroke={series[index].color}
                  strokeWidth={2.5}
                />
                {item.points.map((point, pointIndex) => (
                  <Circle
                    key={`${point.date}-${pointIndex}`}
                    cx={x(point.x)}
                    cy={y(point.y)}
                    r={2.5}
                    fill={series[index].color}
                  />
                ))}
              </G>
            );
          })}
          <SvgText
            fontFamily="Poppins-Regular"
            x={52}
            y={202}
            fontSize={10}
            fill={colors.muted}
          >
            {date(chart.first)}
          </SvgText>
          <SvgText
            fontFamily="Poppins-Regular"
            x={310}
            y={202}
            textAnchor="end"
            fontSize={10}
            fill={colors.muted}
          >
            {date(chart.last)}
          </SvgText>
        </Svg>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {series.map((item) => (
          <View
            key={item.name}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: item.color,
              }}
            />
            <Text
              style={{
                color: colors.ink,
                fontFamily: "Poppins-Regular",
                fontSize: 13,
              }}
            >
              {item.name}
            </Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showValues }}
        onPress={() => setShowValues(!showValues)}
        style={{ minHeight: 40, justifyContent: "center" }}
      >
        <Text
          style={{
            fontFamily: "Poppins-Medium",
            fontSize: 15,
            color: colors.teal,
          }}
        >
          {showValues ? "Hide values" : "View values"}
        </Text>
      </Pressable>
      {showValues
        ? chart.series.map((item) => (
            <View key={item.name} style={{ gap: 8 }}>
              <Body muted={false}>{item.name}</Body>
              {item.points.map((point, index) => (
                <Body key={`${point.date}-${index}`}>
                  {date(point.time)} · {money(String(point.value), currency)}
                </Body>
              ))}
            </View>
          ))
        : null}
    </View>
  );
}
function ViewGrid({
  y,
  label,
  color,
  line,
}: {
  y: number;
  label: string;
  color: string;
  line: string;
}) {
  return (
    <G>
      <Line x1={52} x2={310} y1={y} y2={y} stroke={line} />
      <SvgText
        fontFamily="Poppins-Regular"
        x={44}
        y={y + 3}
        textAnchor="end"
        fontSize={10}
        fill={color}
      >
        {label}
      </SvgText>
    </G>
  );
}
