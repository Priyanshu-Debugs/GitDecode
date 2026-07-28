"use client";

import { useState } from "react";
import styles from "./AdminCharts.module.css";

interface TimelineItem {
  date: string;
  iso_date: string;
  pageviews: number;
  uniques: number;
}

interface TopPageItem {
  path: string;
  count: number;
  percentage: number;
}

interface SystemKpis {
  total_repos: number;
  total_chats: number;
  total_reports: number;
  pro_total: number;
  pro_pending: number;
  pro_approved: number;
  pro_rejected: number;
  conversion_rate: number;
}

interface AdminChartsProps {
  timeline: TimelineItem[];
  topPages: TopPageItem[];
  kpis: SystemKpis;
}

export default function AdminCharts({ timeline, topPages, kpis }: AdminChartsProps) {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    date: string;
    pv: number;
    uniques: number;
  }>({ visible: false, x: 0, y: 0, date: "", pv: 0, uniques: 0 });

  // Calculate max pageview height for SVG chart scaling
  const maxPv = Math.max(10, ...timeline.map((t) => t.pageviews));

  const svgWidth = 720;
  const svgHeight = 160;
  const paddingX = 40;
  const paddingY = 20;
  const graphWidth = svgWidth - paddingX * 2;
  const graphHeight = svgHeight - paddingY * 2;

  const barWidth = Math.max(6, graphWidth / timeline.length - 8);

  return (
    <div className={styles.chartsGrid}>
      {/* ── 14-Day Visitor Timeline SVG Bar Chart ──────────────── */}
      <div className={`${styles.chartCard} ${styles.chartCardWide}`}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>
              <span className={styles.dotGreen} /> 14-Day Traffic &amp; Visitor Timeline
            </h3>
            <p className={styles.chartSub}>// Daily pageviews &amp; unique visitors</p>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.dotGreen} /> Pageviews
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotAmber} /> Uniques
            </span>
          </div>
        </div>

        <div className={styles.timelineWrap}>
          {tooltip.visible && (
            <div
              className={styles.tooltip}
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <strong>{tooltip.date}</strong>: {tooltip.pv} views ({tooltip.uniques} unique)
            </div>
          )}

          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className={styles.svgTimeline}
            preserveAspectRatio="none"
          >
            {/* Background grid lines */}
            <line
              x1={paddingX}
              y1={paddingY}
              x2={svgWidth - paddingX}
              y2={paddingY}
              className={styles.lineGrid}
            />
            <line
              x1={paddingX}
              y1={paddingY + graphHeight / 2}
              x2={svgWidth - paddingX}
              y2={paddingY + graphHeight / 2}
              className={styles.lineGrid}
            />
            <line
              x1={paddingX}
              y1={svgHeight - paddingY}
              x2={svgWidth - paddingX}
              y2={svgHeight - paddingY}
              className={styles.lineGrid}
            />

            {/* Timeline Bars */}
            {timeline.map((item, idx) => {
              const step = graphWidth / (timeline.length - 1 || 1);
              const x = paddingX + idx * step - barWidth / 2;
              
              const pvHeight = (item.pageviews / maxPv) * graphHeight;
              const yPv = svgHeight - paddingY - pvHeight;

              const uHeight = (item.uniques / maxPv) * graphHeight;
              const yU = svgHeight - paddingY - uHeight;

              return (
                <g key={item.iso_date}>
                  {/* Pageview Bar */}
                  <rect
                    x={x}
                    y={yPv}
                    width={barWidth}
                    height={Math.max(2, pvHeight)}
                    className={styles.barPv}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        visible: true,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        date: item.date,
                        pv: item.pageviews,
                        uniques: item.uniques,
                      });
                    }}
                    onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                  />

                  {/* Unique Visitor Dot Indicator */}
                  {item.uniques > 0 && (
                    <circle
                      cx={x + barWidth / 2}
                      cy={yU}
                      r={3}
                      className={styles.barUniques}
                    />
                  )}

                  {/* Date Axis Text */}
                  {idx % 2 === 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={svgHeight - 4}
                      textAnchor="middle"
                      className={styles.axisText}
                    >
                      {item.date}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Top Visited Pages Breakdown ─────────────────────────── */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>Top Visited Routes</h3>
            <p className={styles.chartSub}>// Route traffic distribution</p>
          </div>
        </div>

        {topPages.length > 0 ? (
          <div className={styles.pagesList}>
            {topPages.slice(0, 5).map((p) => (
              <div key={p.path} className={styles.pageRow}>
                <div className={styles.pageRowHeader}>
                  <span className={styles.pathName}>{p.path}</span>
                  <span className={styles.pageMetrics}>
                    {p.count} views ({p.percentage}%)
                  </span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBar}
                    style={{ width: `${p.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyNotice}>No pageview data recorded yet. Navigating pages will record live telemetry.</div>
        )}
      </div>

      {/* ── Pro Plan Conversion & Request Ratio Chart ───────────── */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>Pro Plan Conversion</h3>
            <p className={styles.chartSub}>// Request status breakdown</p>
          </div>
          <span className={styles.chartSub} style={{ color: "var(--color-green)", fontWeight: 700 }}>
            {kpis.conversion_rate}% Approval Rate
          </span>
        </div>

        <div className={styles.proRatioWrap}>
          <div className={styles.ratioTrack}>
            <div
              className={styles.segmentApproved}
              style={{
                width: `${kpis.pro_total > 0 ? (kpis.pro_approved / kpis.pro_total) * 100 : 0}%`,
              }}
              title={`Approved: ${kpis.pro_approved}`}
            />
            <div
              className={styles.segmentPending}
              style={{
                width: `${kpis.pro_total > 0 ? (kpis.pro_pending / kpis.pro_total) * 100 : 0}%`,
              }}
              title={`Pending: ${kpis.pro_pending}`}
            />
            <div
              className={styles.segmentRejected}
              style={{
                width: `${kpis.pro_total > 0 ? (kpis.pro_rejected / kpis.pro_total) * 100 : 0}%`,
              }}
              title={`Rejected: ${kpis.pro_rejected}`}
            />
          </div>

          <div className={styles.ratioLegend}>
            <span className={styles.ratioStat}>
              <span className={styles.segmentApproved} style={{ width: 8, height: 8, borderRadius: 2 }} />
              Approved ({kpis.pro_approved})
            </span>
            <span className={styles.ratioStat}>
              <span className={styles.segmentPending} style={{ width: 8, height: 8, borderRadius: 2 }} />
              Pending ({kpis.pro_pending})
            </span>
            <span className={styles.ratioStat}>
              <span className={styles.segmentRejected} style={{ width: 8, height: 8, borderRadius: 2 }} />
              Rejected ({kpis.pro_rejected})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
