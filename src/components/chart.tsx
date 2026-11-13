"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CountsChart({ data }: { data: { name: string; total: number }[] }) {
  return <div className="h-56 min-w-0 p-4" role="img" aria-label={data.map((item) => item.name + " " + item.total + "건").join(", ")}>
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <BarChart data={data} margin={{ left: -18, top: 10, right: 10, bottom: 5 }}>
        <CartesianGrid vertical={false} stroke="#2d3040" strokeDasharray="4 4" />
        <XAxis dataKey="name" tick={{ fill: "#a3a5b9", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#a3a5b9", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#28263d" }} contentStyle={{ background: "#1d1f2a", border: "1px solid #323547", borderRadius: 8 }} labelStyle={{ color: "#f2f2f6" }} />
        <Bar dataKey="total" name="건수" fill="#a499ff" radius={[5, 5, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
