"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BarChart3,
  BarChartHorizontal,
  LineChart as LineIcon,
  PieChart as PieIcon,
  AreaChart as AreaIcon,
} from "lucide-react";
import {
  useAnalytics,
  SENTIMENT_KEYS,
  SENTIMENT_COLORS,
  RESPONSE_STATUS_KEYS,
  RESPONSE_COLORS,
  RESPONSE_STATUS_LABELS,
  type RangeDays,
} from "@/lib/analytics";

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last 12 months" },
];

const PALETTE = [
  "hsl(217 91% 60%)",
  "hsl(152 60% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 70% 55%)",
  "hsl(200 80% 50%)",
  "hsl(0 72% 55%)",
  "hsl(120 30% 50%)",
  "hsl(45 80% 50%)",
];

type CategoricalType = "bar" | "hbar" | "pie";
type SeriesType = "bar" | "line" | "area";

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeDays>(90);
  const { data, isLoading, error } = useAnalytics(range);

  const isMobile = useIsMobile();
  const [divisionType, setDivisionType] = useState<CategoricalType>("pie");
  const [principleType, setPrincipleType] = useState<CategoricalType>("hbar");
  const [sentimentType, setSentimentType] = useState<SeriesType>("line");
  const [responseType, setResponseType] = useState<SeriesType>("bar");

  const effectiveDivision: CategoricalType = isMobile ? "hbar" : divisionType;
  const effectivePrinciple: CategoricalType = isMobile ? "hbar" : principleType;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submission, classification, and response trends across the consultation.
          </p>
        </div>
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as RangeDays)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load analytics"}
        </div>
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Submissions" value={data.totals.submissions} />
            <Stat label="Classified" value={data.totals.classified} />
            <Stat label="Responses drafted" value={data.totals.responses} />
            <Stat label="Responses sent" value={data.totals.sent} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Submissions by division"
              toolbar={
                isMobile ? null : (
                  <CategoricalToggle value={divisionType} onChange={setDivisionType} />
                )
              }
            >
              <CategoricalChart data={data.byDivision} type={effectiveDivision} />
            </ChartCard>

            <ChartCard
              title="Submissions by principle"
              toolbar={
                isMobile ? null : (
                  <CategoricalToggle value={principleType} onChange={setPrincipleType} />
                )
              }
            >
              <CategoricalChart data={data.byPrinciple} type={effectivePrinciple} />
            </ChartCard>

            <ChartCard
              title="Sentiment trend (weekly)"
              toolbar={
                isMobile ? null : (
                  <SeriesToggle value={sentimentType} onChange={setSentimentType} />
                )
              }
            >
              <SeriesChart
                data={data.sentimentTrend}
                series={SENTIMENT_KEYS.map((k) => ({ key: k, color: SENTIMENT_COLORS[k] }))}
                type={sentimentType}
              />
            </ChartCard>

            <ChartCard
              title="Response status (weekly)"
              toolbar={
                isMobile ? null : (
                  <SeriesToggle value={responseType} onChange={setResponseType} />
                )
              }
            >
              <SeriesChart
                data={data.responseTrend}
                series={RESPONSE_STATUS_KEYS.map((k) => ({ key: k, color: RESPONSE_COLORS[k] }))}
                type={responseType}
                stacked
                legendFormatter={(v) => RESPONSE_STATUS_LABELS[v as string] ?? String(v)}
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function CategoricalToggle({
  value,
  onChange,
}: {
  value: CategoricalType;
  onChange: (v: CategoricalType) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as CategoricalType)}
    >
      <ToggleGroupItem value="bar" aria-label="Vertical bar">
        <BarChart3 className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="hbar" aria-label="Horizontal bar">
        <BarChartHorizontal className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="pie" aria-label="Pie">
        <PieIcon className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function SeriesToggle({
  value,
  onChange,
}: {
  value: SeriesType;
  onChange: (v: SeriesType) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as SeriesType)}
    >
      <ToggleGroupItem value="line" aria-label="Line">
        <LineIcon className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="bar" aria-label="Bar">
        <BarChart3 className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="area" aria-label="Area">
        <AreaIcon className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function CategoricalChart({
  data,
  type,
}: {
  data: { name: string; value: number }[];
  type: CategoricalType;
}) {
  if (data.length === 0) return <EmptyChart />;
  if (type === "pie") {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((sum, d) => sum + d.value, 0) || 1;
    const renderSliceLabel = (props: {
      cx: number;
      cy: number;
      midAngle: number;
      innerRadius: number;
      outerRadius: number;
      percent: number;
    }) => {
      const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
      if (percent < 0.08) return null;
      const RADIAN = Math.PI / 180;
      const r = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + r * Math.cos(-midAngle * RADIAN);
      const y = cy + r * Math.sin(-midAngle * RADIAN);
      return (
        <text
          x={x}
          y={y}
          fill="#ffffff"
          textAnchor="middle"
          dominantBaseline="central"
          fontWeight={700}
          fontSize={13}
          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
        >
          {`${Math.round(percent * 100)}%`}
        </text>
      );
    };
    return (
      <div className="flex flex-col gap-4">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value} (${((value / total) * 100).toFixed(1)}%)`,
                name,
              ]}
            />
            <Pie
              data={sorted}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              labelLine={false}
              label={renderSliceLabel}
            >
              {sorted.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {sorted.map((d, i) => {
            const pct = ((d.value / total) * 100).toFixed(1);
            return (
              <div key={d.name} className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 truncate text-foreground">{d.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {d.value} · {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (type === "hbar") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" allowDecimals={false} className="text-xs" />
          <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          className="text-xs"
          interval={0}
          angle={-25}
          textAnchor="end"
          height={70}
        />
        <YAxis allowDecimals={false} className="text-xs" />
        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SeriesChart({
  data,
  series,
  type,
  stacked,
  legendFormatter,
}: {
  data: Array<Record<string, unknown>>;
  series: { key: string; color: string }[];
  type: SeriesType;
  stacked?: boolean;
  legendFormatter?: (v: unknown) => string;
}) {
  if (data.length === 0) return <EmptyChart />;
  const stackId = stacked ? "s" : undefined;

  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" className="text-xs" />
          <YAxis allowDecimals={false} className="text-xs" />
          <Tooltip />
          <Legend formatter={legendFormatter} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" className="text-xs" />
          <YAxis allowDecimals={false} className="text-xs" />
          <Tooltip />
          <Legend formatter={legendFormatter} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.25}
              stackId={stackId}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="label" className="text-xs" />
        <YAxis allowDecimals={false} className="text-xs" />
        <Tooltip />
        <Legend formatter={legendFormatter} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId={stackId} fill={s.color} name={s.key} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  toolbar,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {toolbar}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
      No data in selected range
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[360px] " />
        ))}
      </div>
    </div>
  );
}
