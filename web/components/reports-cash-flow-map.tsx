"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { InfoTooltip } from "@/components/info-tooltip";

export type ReportsCashFlowAccount = {
  id: string;
  label: string;
  beginningBalance: number;
  incomeAmount: number;
  color: string;
  flows: Array<{
    key: string;
    label: string;
    amount: number;
  }>;
};

export type ReportsCashFlowDestination = {
  key: string;
  label: string;
  color: string;
};

type ReportsCashFlowMapProps = {
  accounts: ReportsCashFlowAccount[];
  destinations: ReportsCashFlowDestination[];
  currency: string;
};

const ALL = "all";
const NODE_WIDTH = 12;

const buildRibbon = (startX: number, startY: number, endX: number, endY: number, height: number) => {
  const controlX1 = startX + (endX - startX) * 0.42;
  const controlX2 = startX + (endX - startX) * 0.58;
  return [
    `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
    `C ${controlX1.toFixed(1)} ${startY.toFixed(1)} ${controlX2.toFixed(1)} ${endY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`,
    `L ${endX.toFixed(1)} ${(endY + height).toFixed(1)}`,
    `C ${controlX2.toFixed(1)} ${(endY + height).toFixed(1)} ${controlX1.toFixed(1)} ${(startY + height).toFixed(1)} ${startX.toFixed(1)} ${(startY + height).toFixed(1)}`,
    "Z",
  ].join(" ");
};

const shortenLabel = (label: string, compact: boolean) => {
  const limit = compact ? 9 : 28;
  return label.length > limit ? `${label.slice(0, limit - 1).trim()}…` : label;
};

export function ReportsCashFlowMap({ accounts, destinations, currency }: ReportsCashFlowMapProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(1000);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [accountFilter, setAccountFilter] = useState(ALL);
  const [destinationFilter, setDestinationFilter] = useState(ALL);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;

    const updateWidth = () => setChartWidth(Math.max(300, Math.round(element.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const destinationColorByKey = useMemo(
    () => new Map(destinations.map((destination) => [destination.key, destination.color])),
    [destinations]
  );

  const filteredAccounts = useMemo(
    () =>
      accounts
        .filter((account) => accountFilter === ALL || account.id === accountFilter)
        .map((account) => {
          const flows = account.flows.filter((flow) => destinationFilter === ALL || flow.key === destinationFilter);
          const beginningBalance = sourceFilter === ALL || sourceFilter === "beginning-balance" ? account.beginningBalance : 0;
          const incomeAmount = sourceFilter === ALL || sourceFilter === "income" ? account.incomeAmount : 0;
          const incomingAmount = beginningBalance + incomeAmount;
          const outgoingAmount = flows.reduce((sum, flow) => sum + flow.amount, 0);
          return {
            ...account,
            beginningBalance,
            incomeAmount,
            flows,
            amount: Math.max(incomingAmount, outgoingAmount),
          };
        })
        .filter((account) => account.amount > 0),
    [accountFilter, accounts, destinationFilter, sourceFilter]
  );

  const sourceNodes = useMemo(
    () =>
      [
        {
          key: "beginning-balance",
          label: "Beginning balance",
          amount: filteredAccounts.reduce((sum, account) => sum + account.beginningBalance, 0),
          color: "#35b878",
        },
        {
          key: "income",
          label: "Income",
          amount: filteredAccounts.reduce((sum, account) => sum + account.incomeAmount, 0),
          color: "#08abc4",
        },
      ].filter((source) => source.amount > 0),
    [filteredAccounts]
  );

  const destinationNodes = useMemo(() => {
    const totals = new Map<string, { key: string; label: string; amount: number; color: string }>();
    for (const account of filteredAccounts) {
      for (const flow of account.flows) {
        const current = totals.get(flow.key) ?? {
          key: flow.key,
          label: flow.label,
          amount: 0,
          color: destinationColorByKey.get(flow.key) ?? "#91a2ae",
        };
        current.amount += flow.amount;
        totals.set(flow.key, current);
      }
    }
    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount);
  }, [destinationColorByKey, filteredAccounts]);

  const compact = chartWidth < 700;
  const chartHeight = Math.max(compact ? 430 : 500, 180 + Math.max(filteredAccounts.length, destinationNodes.length) * (compact ? 38 : 46));
  const columnPadding = 48;
  const availableHeight = chartHeight - columnPadding * 2;
  const accountTotal = filteredAccounts.reduce((sum, account) => sum + account.amount, 0);
  const sourceTotal = sourceNodes.reduce((sum, source) => sum + source.amount, 0);
  const destinationTotal = destinationNodes.reduce((sum, destination) => sum + destination.amount, 0);
  const sourceGap = compact ? 12 : 18;
  const accountGap = compact ? 9 : 14;
  const destinationGap = compact ? 7 : 10;
  const scaleFor = (total: number, count: number, gap: number) =>
    (availableHeight - Math.max(count - 1, 0) * gap) / Math.max(total, 1);
  const scale = Math.max(
    0.0001,
    Math.min(
      scaleFor(sourceTotal, sourceNodes.length, sourceGap),
      scaleFor(accountTotal, filteredAccounts.length, accountGap),
      scaleFor(destinationTotal, destinationNodes.length, destinationGap)
    )
  );

  const layoutColumn = <T extends { amount: number }>(nodes: T[], gap: number) => {
    const columnHeight = nodes.reduce((sum, node) => sum + node.amount * scale, 0) + Math.max(nodes.length - 1, 0) * gap;
    let offset = (chartHeight - columnHeight) / 2;
    return nodes.map((node) => {
      const height = Math.max(node.amount * scale, 1.5);
      const layout = { ...node, y: offset, height };
      offset += height + gap;
      return layout;
    });
  };

  const sourceLayouts = layoutColumn(sourceNodes, sourceGap);
  const accountLayouts = layoutColumn(filteredAccounts, accountGap);
  const destinationLayouts = layoutColumn(destinationNodes, destinationGap);
  const sourceByKey = new Map(sourceLayouts.map((source) => [source.key, source]));
  const destinationByKey = new Map(destinationLayouts.map((destination) => [destination.key, destination]));
  const destinationOrder = new Map(destinationLayouts.map((destination, index) => [destination.key, index]));
  const sourceOffsets = new Map<string, number>();
  const incomingLinks = accountLayouts.flatMap((account) => {
    let accountOffset = 0;
    return [
      { key: "beginning-balance", amount: account.beginningBalance },
      { key: "income", amount: account.incomeAmount },
    ].flatMap((flow) => {
      const source = sourceByKey.get(flow.key);
      if (!source || flow.amount <= 0) return [];
      const height = flow.amount * scale;
      const sourceOffset = sourceOffsets.get(flow.key) ?? 0;
      const link = {
        key: `${flow.key}:${account.id}`,
        color: source.color,
        sourceY: source.y + sourceOffset,
        targetY: account.y + accountOffset,
        height,
      };
      sourceOffsets.set(flow.key, sourceOffset + height);
      accountOffset += height;
      return [link];
    });
  });
  const destinationOffsets = new Map<string, number>();
  const outgoingLinks = accountLayouts.flatMap((account) => {
    let accountOffset = 0;
    return account.flows
      .slice()
      .sort((left, right) => (destinationOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (destinationOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER))
      .flatMap((flow) => {
        const destination = destinationByKey.get(flow.key);
        if (!destination || flow.amount <= 0) return [];
        const height = flow.amount * scale;
        const destinationOffset = destinationOffsets.get(flow.key) ?? 0;
        const link = {
          key: `${account.id}:${flow.key}`,
          color: destination.color,
          sourceY: account.y + accountOffset,
          targetY: destination.y + destinationOffset,
          height,
        };
        destinationOffsets.set(flow.key, destinationOffset + height);
        accountOffset += height;
        return [link];
      });
  });

  const sourceX = compact ? 8 : 20;
  const accountX = Math.round(chartWidth * (compact ? 0.4 : 0.5));
  const destinationX = Math.round(chartWidth * (compact ? 0.72 : 0.8));
  const formatAmount = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <div className="report-sankey">
      <div className="report-sankey__top-row">
        <h4 className="reports-subtab-title">
          <span className="reports-subtab-title__icon" aria-hidden="true">🗺️</span>
          <span>Cash Flow Map</span>
        </h4>
        <div className="report-sankey__filters" aria-label="Cash Flow Map filters">
          <label>
            <span>Sources</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value={ALL}>All sources</option>
              <option value="beginning-balance">Beginning balance</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            <span>Accounts</span>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value={ALL}>All accounts</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
          </label>
          <label>
            <span>Destinations</span>
            <select value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value)}>
              <option value={ALL}>All destinations</option>
              {destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
            </select>
          </label>
        </div>
        <InfoTooltip
          className="reports-container-info"
          label="Shows estimated beginning balances and recorded income flowing through each account into spending categories. Transfers between your own accounts are excluded."
        />
      </div>

      <div ref={chartRef} className="report-sankey__chart-wrap">
        {accountLayouts.length > 0 ? (
          <svg
            className="report-sankey__svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label="Cash flow Sankey diagram"
          >
            <defs>
              <filter id="reportsSankeyNodeShadow" x="-30%" y="-20%" width="160%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
            </defs>
            <text x={sourceX} y="20" className="report-sankey__column-label">Sources</text>
            <text x={accountX} y="20" textAnchor="middle" className="report-sankey__column-label">Accounts</text>
            <text x={destinationX} y="20" className="report-sankey__column-label">Destinations</text>

            {incomingLinks.map((link) => (
              <path
                key={link.key}
                d={buildRibbon(sourceX + NODE_WIDTH, link.sourceY, accountX, link.targetY, link.height)}
                fill={link.color}
                className="report-sankey__ribbon report-sankey__ribbon--income"
              />
            ))}
            {sourceLayouts.map((source) => (
              <g key={source.key}>
                <rect x={sourceX} y={source.y} width={NODE_WIDTH} height={source.height} rx="3" fill={source.color} filter="url(#reportsSankeyNodeShadow)" />
                <text x={sourceX + NODE_WIDTH + 7} y={source.y + source.height / 2 - 3} className="report-sankey__source-label">
                  {shortenLabel(source.label, compact)}
                </text>
                <text x={sourceX + NODE_WIDTH + 7} y={source.y + source.height / 2 + 13} className="report-sankey__source-value">
                  {formatAmount(source.amount)}
                </text>
              </g>
            ))}
            {accountLayouts.map((account) => (
              <g key={account.id}>
                <rect x={accountX} y={account.y} width={NODE_WIDTH} height={account.height} rx="3" fill={account.color} filter="url(#reportsSankeyNodeShadow)" />
                <text
                  x={compact ? accountX + NODE_WIDTH + 7 : accountX - 7}
                  y={account.y + account.height / 2 - 3}
                  textAnchor={compact ? "start" : "end"}
                  className="report-sankey__target-label report-sankey__account-label"
                >
                  <tspan className="report-sankey__target-title">{shortenLabel(account.label, compact)}</tspan>
                </text>
                <text
                  x={compact ? accountX + NODE_WIDTH + 7 : accountX - 7}
                  y={account.y + account.height / 2 + 13}
                  textAnchor={compact ? "start" : "end"}
                  className="report-sankey__target-value"
                >
                  {formatAmount(account.amount)}
                </text>
              </g>
            ))}
            {outgoingLinks.map((link) => (
              <path
                key={link.key}
                d={buildRibbon(accountX + NODE_WIDTH, link.sourceY, destinationX, link.targetY, link.height)}
                fill={link.color}
                className="report-sankey__ribbon report-sankey__ribbon--category"
              />
            ))}
            {destinationLayouts.map((destination) => (
              <g key={destination.key}>
                <rect x={destinationX} y={destination.y} width={NODE_WIDTH} height={destination.height} rx="3" fill={destination.color} filter="url(#reportsSankeyNodeShadow)" />
                <text x={destinationX + NODE_WIDTH + 7} y={destination.y + destination.height / 2 - 3} className="report-sankey__target-title">
                  {shortenLabel(destination.label, compact)}
                </text>
                <text x={destinationX + NODE_WIDTH + 7} y={destination.y + destination.height / 2 + 13} className="report-sankey__target-value">
                  {formatAmount(destination.amount)} · {Math.round((destination.amount / Math.max(destinationTotal, 1)) * 100)}%
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="report-sankey__empty">
            <strong>{accounts.length > 0 ? "No cash flow matches these filters." : "Add a little more activity to see the cash flow map."}</strong>
            <span>{accounts.length > 0 ? "Choose another source, account, or destination." : "Once a few categories are tracked, the diagram will show how income fans out across the month."}</span>
          </div>
        )}
      </div>
    </div>
  );
}
