import { useState } from "react";
import { View } from "react-native";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";
import { DropdownFilter } from "./transaction-filters";
import { Body, money, useTheme } from "./ui";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
export function ReportsCashFlow({ report }: { report: ReportCurrencyData }) {
  const { colors } = useTheme();
  const [source, setSource] = useState("all"),
    [account, setAccount] = useState("all"),
    [destination, setDestination] = useState("all"),
    [width, setWidth] = useState(320);
  const accounts = report.cashFlow
    .filter((a) => account === "all" || a.id === account)
    .map((a) => ({
      ...a,
      beginningBalance: source === "income" ? 0 : a.beginningBalance,
      incomeAmount: source === "opening" ? 0 : a.incomeAmount,
      flows: a.flows.filter(
        (f) => destination === "all" || f.key === destination,
      ),
    }));
  const destinationOptions = [
    ...report.analysis.categories.map((c) => ({ name: c.name, key: c.name })),
    { name: "Unspent", key: "__remaining__" },
  ];
  const destinations = destinationOptions
    .filter((c) => destination === "all" || c.key === destination)
    .map((c) => ({
      key: c.key,
      label: c.name,
      amount: accounts.reduce(
        (n, a) =>
          n +
          a.flows
            .filter((f) => f.key === c.key)
            .reduce((s, f) => s + f.amount, 0),
        0,
      ),
    }))
    .filter((x) => x.amount > 0);
  const sources = [
    {
      label: "Beginning balance",
      amount: accounts.reduce((n, a) => n + a.beginningBalance, 0),
    },
    {
      label: "Income",
      amount: accounts.reduce((n, a) => n + a.incomeAmount, 0),
    },
  ].filter((s) => s.amount > 0);
  const middle = accounts
    .map((a) => ({
      ...a,
      amount: Math.max(
        a.beginningBalance + a.incomeAmount,
        a.flows.reduce((n, f) => n + f.amount, 0),
      ),
    }))
    .filter((a) => a.amount > 0);
  const h = Math.max(
      300,
      Math.max(middle.length, destinations.length) * 52 + 80,
    ),
    gap = 22;
  const scale = Math.min(
    ...[sources, middle, destinations].map(
      (list) =>
        (h - 80 - Math.max(0, list.length - 1) * gap) /
        Math.max(
          1,
          list.reduce((n, a) => n + a.amount, 0),
        ),
    ),
  );
  const nodes = <T extends { amount: number }>(items: T[]) => {
    let y = 40;
    return items.map((a) => {
      const n = { ...a, y, h: a.amount * scale };
      y += n.h + gap;
      return n;
    });
  };
  const left = nodes(sources),
    center = nodes(middle),
    right = nodes(destinations),
    x1 = 16,
    x2 = width * 0.48,
    x3 = width - 20;
  const ribbon = (
    x: number,
    y: number,
    toX: number,
    toY: number,
    height: number,
  ) =>
    `M${x},${y} C${(x + toX) / 2},${y} ${(x + toX) / 2},${toY} ${toX},${toY} L${toX},${toY + height} C${(x + toX) / 2},${toY + height} ${(x + toX) / 2},${y + height} ${x},${y + height} Z`;
  const sourceOffsets = new Map<string, number>(),
    destOffsets = new Map<string, number>();
  const paths = center.flatMap((a) => {
    let sy = 0,
      dy = 0;
    const result: { key: string; path: string; color: string }[] = [];
    for (const s of left) {
      const amount = s.label === "Income" ? a.incomeAmount : a.beginningBalance;
      const sh = amount * scale;
      if (sh) {
        const offset = sourceOffsets.get(s.label) ?? 0;
        result.push({
          key: a.id + s.label,
          path: ribbon(x1 + 8, s.y + offset, x2, a.y + sy, sh),
          color: s.label === "Income" ? colors.positive : colors.teal,
        });
        sourceOffsets.set(s.label, offset + sh);
        sy += sh;
      }
    }
    for (const f of a.flows) {
      const d = right.find((d) => d.key === f.key);
      if (!d) continue;
      const fh = f.amount * scale,
        offset = destOffsets.get(d.label) ?? 0;
      result.push({
        key: a.id + f.key,
        path: ribbon(x2 + 8, a.y + dy, x3, d.y + offset, fh),
        color: colors.teal,
      });
      destOffsets.set(d.label, offset + fh);
      dy += fh;
    }
    return result;
  });
  return (
    <View
      style={{ gap: 12 }}
      onLayout={(e) => setWidth(Math.max(240, e.nativeEvent.layout.width))}
    >
      <DropdownFilter
        label="Source"
        value={source}
        options={[
          { value: "all", label: "All sources" },
          { value: "opening", label: "Beginning balance" },
          { value: "income", label: "Income" },
        ]}
        onChange={setSource}
      />
      <DropdownFilter
        label="Account"
        value={account}
        options={[
          { value: "all", label: "All accounts" },
          ...report.cashFlow.map((a) => ({ value: a.id, label: a.label })),
        ]}
        onChange={setAccount}
      />
      <DropdownFilter
        label="Destination"
        value={destination}
        options={[
          { value: "all", label: "All destinations" },
          ...destinationOptions.map((c) => ({
            value: c.key,
            key: c.key,
            label: c.name,
          })),
        ]}
        onChange={setDestination}
      />
      {center.length ? (
        <Svg
          width="100%"
          height={h}
          viewBox={`0 0 ${width} ${h}`}
          accessibilityLabel="Cash flow from beginning balances and income through accounts to categories"
        >
          {paths.map((p) => (
            <Path key={p.key} d={p.path} fill={p.color} opacity={0.3} />
          ))}
          {left.map((n) => (
            <Rect
              key={n.label}
              x={x1}
              y={n.y}
              width={8}
              height={n.h}
              fill={colors.positive}
            />
          ))}
          {center.map((n) => (
            <Rect
              key={n.id}
              x={x2}
              y={n.y}
              width={8}
              height={n.h}
              fill={colors.teal}
            />
          ))}
          {right.map((n) => (
            <Rect
              key={n.label}
              x={x3}
              y={n.y}
              width={8}
              height={n.h}
              fill={colors.teal}
            />
          ))}
          {[
            [left, x1, "start"],
            [center.map((a) => ({ ...a, label: a.label })), x2, "middle"],
            [right, x3 + 8, "end"],
          ].map(([ns, x, anchor]) =>
            (ns as { label: string; y: number }[]).map((n) => (
              <SvgText
                key={String(x) + n.label}
                x={x as number}
                y={n.y - 7}
                fill={colors.ink}
                textAnchor={anchor as "start" | "middle" | "end"}
                fontSize={10}
              >
                {n.label.length > 13 ? n.label.slice(0, 12) + "…" : n.label}
              </SvgText>
            )),
          )}
        </Svg>
      ) : (
        <Body>No flows in this selection.</Body>
      )}
      {center.map((a) => (
        <Body key={a.id}>
          {a.label}: {money(String(a.beginningBalance), report.currency)}{" "}
          beginning balance · {money(String(a.incomeAmount), report.currency)}{" "}
          income
        </Body>
      ))}
      {right.map((d) => (
        <Body key={d.label}>
          {d.label}: {money(String(d.amount), report.currency)}
        </Body>
      ))}
      <Body>
        Internal transfers are excluded. Beginning balances are estimates from
        recorded movements.
      </Body>
    </View>
  );
}
