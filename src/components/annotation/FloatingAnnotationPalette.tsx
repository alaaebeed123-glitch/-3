import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Keyboard,
  Loader2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Settings,
  SlidersHorizontal,
  Spline,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  useAnnotationActions,
  useAnnotationDockState,
  useAnnotationToolState,
} from './AnnotationContext';
import { flattenShapeToFreehandPoints, type RenderTransform } from './strokeEngine';
import {
  APPLE_HIGHLIGHTER_COLORS,
  APPLE_LASER_COLORS,
  APPLE_PENCIL_COLORS,
  APPLE_PEN_COLORS,
  APPLE_TAPE_COLORS,
  SIZE_DIAL_MAX,
  SIZE_DIAL_MIN,
  SIZE_DIAL_STEP,
  applyMagneticSnap,
  clampSizeLevel,
  laserSizeLevelToPx,
  pxToLaserSizeLevel,
  pxToSizeLevel,
  sizeLevelToPx,
  snapSizeLevel,
  type AnnotationTool,
  type ColorSlotIndex,
  type ColorSwatch,
  type ColorableAnnotationTool,
  type PenLineStyle,
  type SizableAnnotationTool,
  type SizeSlotIndex,
  type TapePattern,
} from './types';
import { toArabicDigits } from '../../utils/mushafData';

function buildFountainPreviewSvgPath(nibAngleDeg: number, sizePx: number): string {
  const rad = (nibAngleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  const a = Math.max(1.8, Math.min(6.2, sizePx * 0.48));
  const b = Math.max(0.75, Math.min(1.8, a * 0.23));

  const sampleCubic = (
    p0: [number, number],
    c1: [number, number],
    c2: [number, number],
    p1: [number, number],
    steps: number,
    skipFirst: boolean
  ): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
      const t = i / steps;
      const inv = 1 - t;
      pts.push([
        inv * inv * inv * p0[0] + 3 * inv * inv * t * c1[0] + 3 * inv * t * t * c2[0] + t * t * t * p1[0],
        inv * inv * inv * p0[1] + 3 * inv * inv * t * c1[1] + 3 * inv * t * t * c2[1] + t * t * t * p1[1],
      ]);
    }
    return pts;
  };

  const pts = [
    ...sampleCubic([16, 22], [44, 10], [72, 29], [104, 16], 18, false),
    ...sampleCubic([104, 16], [128, 7], [148, 24], [166, 12], 14, true),
  ];

  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i > 0 ? i - 1 : 0];
    const next = pts[i < pts.length - 1 ? i + 1 : pts.length - 1];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const nu = nx * ux + ny * uy;
    const nv = nx * vx + ny * vy;
    const denom = Math.hypot(a * nu, b * nv) || 1;
    const ex = ((a * a * nu) * ux + (b * b * nv) * vx) / denom;
    const ey = ((a * a * nu) * uy + (b * b * nv) * vy) / denom;
    left.push([pts[i][0] + ex, pts[i][1] + ey]);
    right.push([pts[i][0] - ex, pts[i][1] - ey]);
  }

  let d = `M ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}`;
  for (let i = 1; i < left.length; i++) {
    d += ` L ${left[i][0].toFixed(1)} ${left[i][1].toFixed(1)}`;
  }
  for (let i = right.length - 1; i >= 0; i--) {
    d += ` L ${right[i][0].toFixed(1)} ${right[i][1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * Realistic Apple PencilKit-grade static studio illustrations (viewBox 46x54).
 * Uses pure multi-stop cylindrical gradients and crisp specular highlights —
 * wrapped in React.memo with zero SVG filters or motion transitions for zero lag.
 */
const ApplePenNibSvg = React.memo<{ color: string; sizeLevel: number }>(({ color, sizeLevel }) => {
  const gaugeRadius = Math.max(1.7, Math.min(3.6, 1.7 + ((sizeLevel - 5) / 95) * 1.9));

  return (
    <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
      {/* Precision color-matched ink nib with fine edge sheen */}
      <path
        d="M23 3.2C23.52 3.2 24.02 3.6 24.28 4.26L26.55 10.6C24.3 11.24 21.7 11.24 19.45 10.6L21.72 4.26C21.98 3.6 22.48 3.2 23 3.2Z"
        fill={color}
      />
      <path
        d="M22.35 4.75L20.95 9.85C21.45 10.0 21.9 10.05 22.3 10.05L22.9 4.8Z"
        fill="rgba(255, 255, 255, 0.42)"
      />
      {/* Sculpted matte-porcelain conical nose */}
      <path
        d="M19.45 10.6C21.7 11.24 24.3 11.24 26.55 10.6L31.4 21.8H14.6L19.45 10.6Z"
        fill="url(#pkStudioPenCone)"
        stroke="rgba(15, 23, 42, 0.14)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* Curved specular rib on cone */}
      <path d="M20.3 11.4L16.5 21.2H18.4L21.4 11.5Z" fill="rgba(255, 255, 255, 0.72)" />
      {/* Brushed satin-aluminum collar */}
      <path
        d="M14.45 21.8H31.55L31.9 24.6H14.1L14.45 21.8Z"
        fill="url(#pkStudioPenFerrule)"
        stroke="rgba(15, 23, 42, 0.12)"
        strokeWidth="0.65"
      />
      {/* Sculpted matte-ceramic barrel deeply rooted into dock rim */}
      <path
        d="M14.1 24.6H31.9V80H14.1V24.6Z"
        fill="url(#pkStudioPenBarrel)"
        stroke="rgba(15, 23, 42, 0.12)"
        strokeWidth="0.7"
      />
      {/* Cylindrical live-color ink band + wrap highlight */}
      <rect x="14.1" y="27.2" width="17.8" height="5.2" fill={color} opacity="0.94" />
      <rect x="14.1" y="27.2" width="17.8" height="5.2" fill="url(#pkStudioCylWrap)" />
      <rect x="14.2" y="33.9" width="17.6" height="1.15" rx="0.55" fill={color} opacity="0.35" />
      {/* Recessed live-size indicator jewel */}
      <circle cx="23" cy="41.4" r={gaugeRadius} fill={color} opacity="0.88" />
      <circle cx={22.4} cy={40.8} r={Math.max(0.65, gaugeRadius * 0.34)} fill="rgba(255,255,255,0.55)" />
      {/* Silky studio cylinder specular strip */}
      <rect x="16.8" y="25.4" width="2.4" height="53.6" rx="1.2" fill="rgba(255, 255, 255, 0.42)" />
      <defs>
        <linearGradient id="pkStudioPenCone" x1="14.6" y1="16" x2="31.4" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D7E0EB" />
          <stop offset="0.28" stopColor="#FFFFFF" />
          <stop offset="0.65" stopColor="#F4F7FA" />
          <stop offset="0.9" stopColor="#C7D3E0" />
          <stop offset="1" stopColor="#DCE4EE" />
        </linearGradient>
        <linearGradient id="pkStudioPenFerrule" x1="14.1" y1="23.2" x2="31.9" y2="23.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BAC6D2" />
          <stop offset="0.3" stopColor="#F8FAFC" />
          <stop offset="0.66" stopColor="#DCE3EC" />
          <stop offset="1" stopColor="#9EADB9" />
        </linearGradient>
        <linearGradient id="pkStudioPenBarrel" x1="14.1" y1="37" x2="31.9" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCE4EE" />
          <stop offset="0.28" stopColor="#FFFFFF" />
          <stop offset="0.64" stopColor="#F8FAFC" />
          <stop offset="0.9" stopColor="#CED8E4" />
          <stop offset="1" stopColor="#E1E8F0" />
        </linearGradient>
        <linearGradient id="pkStudioCylWrap" x1="14.1" y1="29.8" x2="31.9" y2="29.8" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(15, 23, 42, 0.18)" />
          <stop offset="0.28" stopColor="rgba(255, 255, 255, 0.34)" />
          <stop offset="0.62" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="0.9" stopColor="rgba(15, 23, 42, 0.2)" />
          <stop offset="1" stopColor="rgba(255, 255, 255, 0.1)" />
        </linearGradient>
      </defs>
    </svg>
  );
});

/**
 * Extracted calm upright Apple Pencil glyph for the minimized circular orb.
 * Straight flat barrel anchored flush at the bottom of the circle, neutral slate tone.
 */
const AppleOrbPenGlyphSvg = React.memo(() => (
  <svg className="apple-orb-pen-svg" viewBox="0 0 46 64" fill="none" aria-hidden="true">
    {/* Precision neutral slate tip */}
    <path
      d="M23 4.5C23.52 4.5 24.02 4.9 24.28 5.56L26.55 11.9C24.3 12.54 21.7 12.54 19.45 11.9L21.72 5.56C21.98 4.9 22.48 4.5 23 4.5Z"
      fill="#334155"
    />
    <path
      d="M22.35 6.05L20.95 11.15C21.45 11.3 21.9 11.35 22.3 11.35L22.9 6.1Z"
      fill="rgba(255, 255, 255, 0.38)"
    />
    {/* Sculpted matte-porcelain conical nose */}
    <path
      d="M19.45 11.9C21.7 12.54 24.3 12.54 26.55 11.9L31.4 23.1H14.6L19.45 11.9Z"
      fill="url(#pkOrbPenCone)"
      stroke="rgba(15, 23, 42, 0.16)"
      strokeWidth="0.7"
      strokeLinejoin="round"
    />
    {/* Curved specular rib on cone */}
    <path d="M20.3 12.7L16.5 22.5H18.4L21.4 12.8Z" fill="rgba(255, 255, 255, 0.72)" />
    {/* Brushed satin-aluminum collar */}
    <path
      d="M14.45 23.1H31.55L31.9 25.9H14.1L14.45 23.1Z"
      fill="url(#pkOrbPenFerrule)"
      stroke="rgba(15, 23, 42, 0.14)"
      strokeWidth="0.65"
    />
    {/* Straight cylindrical ceramic barrel ending flat at bottom */}
    <path
      d="M14.1 25.9H31.9V64H14.1V25.9Z"
      fill="url(#pkOrbPenBarrel)"
      stroke="rgba(15, 23, 42, 0.14)"
      strokeWidth="0.7"
    />
    {/* Quiet neutral graphite collar band */}
    <rect x="14.1" y="28.6" width="17.8" height="4.8" fill="#475569" opacity="0.9" />
    <rect x="14.1" y="28.6" width="17.8" height="4.8" fill="url(#pkOrbCylWrap)" />
    <rect x="14.2" y="34.9" width="17.6" height="1.1" rx="0.55" fill="#64748B" opacity="0.28" />
    {/* Subtle studio cylinder highlight strip */}
    <rect x="16.8" y="26.7" width="2.4" height="36.5" rx="1.2" fill="rgba(255, 255, 255, 0.44)" />
    <defs>
      <linearGradient id="pkOrbPenCone" x1="14.6" y1="17.5" x2="31.4" y2="17.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D7E0EB" />
        <stop offset="0.28" stopColor="#FFFFFF" />
        <stop offset="0.65" stopColor="#F4F7FA" />
        <stop offset="0.9" stopColor="#C7D3E0" />
        <stop offset="1" stopColor="#DCE4EE" />
      </linearGradient>
      <linearGradient id="pkOrbPenFerrule" x1="14.1" y1="24.5" x2="31.9" y2="24.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#BAC6D2" />
        <stop offset="0.3" stopColor="#F8FAFC" />
        <stop offset="0.66" stopColor="#DCE3EC" />
        <stop offset="1" stopColor="#9EADB9" />
      </linearGradient>
      <linearGradient id="pkOrbPenBarrel" x1="14.1" y1="44" x2="31.9" y2="44" gradientUnits="userSpaceOnUse">
        <stop stopColor="#DCE4EE" />
        <stop offset="0.28" stopColor="#FFFFFF" />
        <stop offset="0.64" stopColor="#F8FAFC" />
        <stop offset="0.9" stopColor="#CED8E4" />
        <stop offset="1" stopColor="#E1E8F0" />
      </linearGradient>
      <linearGradient id="pkOrbCylWrap" x1="14.1" y1="31" x2="31.9" y2="31" gradientUnits="userSpaceOnUse">
        <stop stopColor="rgba(15, 23, 42, 0.16)" />
        <stop offset="0.28" stopColor="rgba(255, 255, 255, 0.34)" />
        <stop offset="0.62" stopColor="rgba(255, 255, 255, 0)" />
        <stop offset="0.9" stopColor="rgba(15, 23, 42, 0.2)" />
        <stop offset="1" stopColor="rgba(255, 255, 255, 0.1)" />
      </linearGradient>
    </defs>
  </svg>
));

const AppleHighlighterNibSvg = React.memo<{ color: string; sizeLevel: number }>(
  ({ color, sizeLevel }) => {
    const ribbonHeight = Math.max(2.6, Math.min(6.4, 2.6 + ((sizeLevel - 5) / 95) * 3.8));
    const ribbonY = 36.8 - ribbonHeight / 2;

    return (
      <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
        {/* Authentic beveled chisel felt tip */}
        <path
          d="M15.4 8.6L29.6 4.2C30.45 3.94 31.3 4.52 31.36 5.4L31.8 15.6H14.2L14.78 9.8C14.86 9.22 15.08 8.76 15.4 8.6Z"
          fill={color}
          opacity="0.94"
          stroke="rgba(15, 23, 42, 0.16)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Crisp chisel bevel highlight */}
        <path d="M15.9 9.0L29.4 4.8L30.45 7.1L16.05 11.4Z" fill="rgba(255, 255, 255, 0.44)" />
        <rect x="14.3" y="14.5" width="17.4" height="1.1" fill="rgba(15, 23, 42, 0.12)" />
        {/* Sculpted ergonomic marker shoulder */}
        <path
          d="M13.2 15.6H32.8L35.2 22.8H10.8L13.2 15.6Z"
          fill="url(#pkStudioHlShoulder)"
          stroke="rgba(15, 23, 42, 0.12)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Machined satin neck collar */}
        <rect
          x="10.7"
          y="21.9"
          width="24.6"
          height="2.1"
          rx="0.7"
          fill="url(#pkStudioHlRing)"
          stroke="rgba(15, 23, 42, 0.11)"
          strokeWidth="0.6"
        />
        {/* Broad matte-porcelain highlighter body deeply rooted into dock rim */}
        <path
          d="M10.8 24H35.2V80H10.8V24Z"
          fill="url(#pkStudioHlBarrel)"
          stroke="rgba(15, 23, 42, 0.12)"
          strokeWidth="0.7"
        />
        {/* Satin-translucent colored grip sleeve + studio cylinder gloss */}
        <path
          d="M10.8 29.4C10.8 28.18 11.78 27.2 13 27.2H33C34.22 27.2 35.2 28.18 35.2 29.4V80H10.8V29.4Z"
          fill={color}
          opacity="0.86"
        />
        <path
          d="M10.8 29.4C10.8 28.18 11.78 27.2 13 27.2H33C34.22 27.2 35.2 28.18 35.2 29.4V80H10.8V29.4Z"
          fill="url(#pkStudioHlSleeveGloss)"
        />
        {/* Clean live chisel-width indicator ribbon */}
        <path
          d={`M16.2 ${ribbonY + 1.1}L30.2 ${ribbonY - 0.8}L29.5 ${ribbonY + ribbonHeight - 0.8}L15.5 ${ribbonY + ribbonHeight + 1.1}Z`}
          fill="rgba(255, 255, 255, 0.86)"
        />
        {/* Porcelain vertical sheen */}
        <rect x="14.1" y="24.8" width="2.6" height="54.2" rx="1.3" fill="rgba(255, 255, 255, 0.34)" />
        <defs>
          <linearGradient id="pkStudioHlShoulder" x1="10.8" y1="19.2" x2="35.2" y2="19.2" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D7E0EB" />
            <stop offset="0.3" stopColor="#FFFFFF" />
            <stop offset="0.66" stopColor="#F5F7FA" />
            <stop offset="0.9" stopColor="#C8D4E1" />
            <stop offset="1" stopColor="#DCE4EE" />
          </linearGradient>
          <linearGradient id="pkStudioHlRing" x1="10.7" y1="22.95" x2="35.3" y2="22.95" gradientUnits="userSpaceOnUse">
            <stop stopColor="#BAC6D2" />
            <stop offset="0.32" stopColor="#F8FAFC" />
            <stop offset="0.68" stopColor="#DCE3EC" />
            <stop offset="1" stopColor="#A0AEBC" />
          </linearGradient>
          <linearGradient id="pkStudioHlBarrel" x1="10.8" y1="37" x2="35.2" y2="37" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DCE4EE" />
            <stop offset="0.28" stopColor="#FFFFFF" />
            <stop offset="0.64" stopColor="#F8FAFC" />
            <stop offset="0.9" stopColor="#CED8E4" />
            <stop offset="1" stopColor="#E1E8F0" />
          </linearGradient>
          <linearGradient id="pkStudioHlSleeveGloss" x1="10.8" y1="36.3" x2="35.2" y2="36.3" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(15, 23, 42, 0.14)" />
            <stop offset="0.26" stopColor="rgba(255, 255, 255, 0.36)" />
            <stop offset="0.6" stopColor="rgba(255, 255, 255, 0)" />
            <stop offset="0.9" stopColor="rgba(15, 23, 42, 0.16)" />
            <stop offset="1" stopColor="rgba(255, 255, 255, 0.1)" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
);

const AppleLaserStylusSvg = React.memo<{
  color: string;
  sizeLevel: number;
  isActive: boolean;
}>(({ color, sizeLevel, isActive }) => {
  const haloRadius = (isActive ? 7.6 : 5.6) + ((sizeLevel - 5) / 95) * 1.4;

  return (
    <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
      {/* Pure-gradient optical aura around glass lens (no SVG blur filter) */}
      <circle
        cx="23"
        cy="8.2"
        r={haloRadius}
        fill="url(#pkStudioLaserHalo)"
        opacity={isActive ? 0.85 : 0.45}
      />
      <circle cx="23" cy="8.2" r={haloRadius * 0.56} fill={color} opacity={isActive ? 0.28 : 0.16} />
      {/* Precision glass optical emitter lens */}
      <circle cx="23" cy="8.2" r="3.45" fill={color} stroke="rgba(15, 23, 42, 0.22)" strokeWidth="0.6" />
      <circle cx="22.1" cy="7.3" r="1.15" fill="#FFFFFF" opacity="0.96" />
      {/* Chamfered brushed-titanium emitter crown */}
      <path
        d="M17.4 12.6H28.6L31.2 21.4H14.8L17.4 12.6Z"
        fill="url(#pkStudioLaserCrown)"
        stroke="rgba(15, 23, 42, 0.18)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <line x1="16.4" y1="16.9" x2="29.6" y2="16.9" stroke="rgba(15, 23, 42, 0.14)" strokeWidth="0.7" />
      {/* Anodized Space-Gray aluminum presenter barrel deeply rooted into dock rim */}
      <path
        d="M14.8 21.4H31.2V80H14.8V21.4Z"
        fill="url(#pkStudioLaserBody)"
        stroke="rgba(15, 23, 42, 0.24)"
        strokeWidth="0.7"
      />
      {/* Recessed color-matched optical accent ring */}
      <rect x="14.8" y="24.6" width="16.4" height="3" fill={color} opacity="0.94" />
      <rect x="14.8" y="24.6" width="16.4" height="3" fill="url(#pkStudioLaserRingSheen)" />
      {/* Flush machined pill presenter trigger */}
      <rect
        x="19.8"
        y="31.8"
        width="6.4"
        height="12.6"
        rx="3.2"
        fill="url(#pkStudioLaserBtn)"
        stroke="rgba(255, 255, 255, 0.22)"
        strokeWidth="0.75"
      />
      <circle cx="23" cy="36.2" r="1.35" fill={color} opacity={isActive ? 0.98 : 0.72} />
      {/* Anodized specular strip */}
      <rect x="17.2" y="22.4" width="2.1" height="56.6" rx="1.05" fill="rgba(255, 255, 255, 0.14)" />
      <defs>
        <radialGradient
          id="pkStudioLaserHalo"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(23 8.2) rotate(90) scale(8.8)"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.78" />
          <stop offset="0.38" stopColor={color} stopOpacity="0.42" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pkStudioLaserCrown" x1="14.8" y1="17" x2="31.2" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B5C1CE" />
          <stop offset="0.3" stopColor="#F8FAFC" />
          <stop offset="0.66" stopColor="#D6DEE8" />
          <stop offset="0.92" stopColor="#8E9DAD" />
          <stop offset="1" stopColor="#B0BCC9" />
        </linearGradient>
        <linearGradient id="pkStudioLaserBody" x1="14.8" y1="35.7" x2="31.2" y2="35.7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#334155" />
          <stop offset="0.28" stopColor="#64748B" />
          <stop offset="0.58" stopColor="#475569" />
          <stop offset="0.88" stopColor="#1E293B" />
          <stop offset="1" stopColor="#3B485A" />
        </linearGradient>
        <linearGradient id="pkStudioLaserRingSheen" x1="14.8" y1="26.1" x2="31.2" y2="26.1" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(0,0,0,0.2)" />
          <stop offset="0.3" stopColor="rgba(255,255,255,0.36)" />
          <stop offset="0.9" stopColor="rgba(0,0,0,0.22)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.1)" />
        </linearGradient>
        <linearGradient id="pkStudioLaserBtn" x1="19.8" y1="38.1" x2="26.2" y2="38.1" gradientUnits="userSpaceOnUse">
          <stop stopColor="#475569" />
          <stop offset="0.38" stopColor="#64748B" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
      </defs>
    </svg>
  );
});

const AppleEraserNibSvg = React.memo<{ sizeLevel: number; highlighterOnly?: boolean }>(
  ({ sizeLevel, highlighterOnly = false }) => {
    const gaugeWidth = Math.max(5.6, Math.min(12.8, 5.6 + ((sizeLevel - 5) / 95) * 7.2));
    const gaugeColor = highlighterOnly ? '#F59E0B' : '#E11D48';

    return (
      <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
        {/* Iconic rounded architectural rubber eraser head */}
        <path
          d="M13.6 10C13.6 6.7 16.2 4.5 19.5 4.5H26.5C29.8 4.5 32.4 6.7 32.4 10V21.8H13.6V10Z"
          fill="url(#pkStudioEraserRubber)"
          stroke={highlighterOnly ? 'rgba(217, 119, 6, 0.34)' : 'rgba(190, 24, 93, 0.2)'}
          strokeWidth="0.7"
        />
        {/* Top crown satin highlight */}
        <path
          d="M15.4 8.3C16.05 6.6 17.5 5.65 19.5 5.65H26.5C28.1 5.65 29.4 6.2 30.15 7.4C28.05 7.95 25.55 8.3 23 8.3C20.2 8.3 17.6 8.6 15.4 8.3Z"
          fill="rgba(255, 255, 255, 0.58)"
        />
        <rect x="15.8" y="8.9" width="2.3" height="11.4" rx="1.15" fill="rgba(255, 255, 255, 0.4)" />
        {/* Brushed satin-aluminum ferrule band */}
        <rect
          x="12.5"
          y="21.4"
          width="21"
          height="6.1"
          rx="1.4"
          fill="url(#pkStudioEraserFerrule)"
          stroke="rgba(15, 23, 42, 0.13)"
          strokeWidth="0.7"
        />
        <line x1="13.2" y1="23.5" x2="32.8" y2="23.5" stroke="rgba(15, 23, 42, 0.12)" strokeWidth="0.65" />
        <line x1="13.2" y1="25.5" x2="32.8" y2="25.5" stroke="rgba(15, 23, 42, 0.1)" strokeWidth="0.65" />
        {/* Matte-porcelain architectural sleeve deeply rooted into dock rim */}
        <path
          d="M12.6 27.5H33.4V80H12.6V27.5Z"
          fill="url(#pkStudioEraserSleeve)"
          stroke="rgba(15, 23, 42, 0.12)"
          strokeWidth="0.7"
        />
        {/* Live-size gauge pill (rose normally, amber in highlighter-only mode) */}
        <rect
          x={23 - gaugeWidth / 2}
          y="36.8"
          width={gaugeWidth}
          height="3.2"
          rx="1.6"
          fill={gaugeColor}
          opacity={highlighterOnly ? 0.88 : 0.74}
        />
        <rect x="15.6" y="28.6" width="2.5" height="50.4" rx="1.25" fill="rgba(255, 255, 255, 0.38)" />
      <defs>
        <linearGradient id="pkStudioEraserRubber" x1="13.6" y1="13.2" x2="32.4" y2="13.2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2B8CE" />
          <stop offset="0.3" stopColor="#FFF7FA" />
          <stop offset="0.66" stopColor="#FCDCE8" />
          <stop offset="0.9" stopColor="#E397B4" />
          <stop offset="1" stopColor="#EEB4CA" />
        </linearGradient>
        <linearGradient id="pkStudioEraserFerrule" x1="12.5" y1="24.45" x2="33.5" y2="24.45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BAC6D2" />
          <stop offset="0.32" stopColor="#F8FAFC" />
          <stop offset="0.68" stopColor="#DCE3EC" />
          <stop offset="1" stopColor="#9EADB9" />
        </linearGradient>
        <linearGradient id="pkStudioEraserSleeve" x1="12.6" y1="38.75" x2="33.4" y2="38.75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCE4EE" />
          <stop offset="0.28" stopColor="#FFFFFF" />
          <stop offset="0.64" stopColor="#F8FAFC" />
          <stop offset="0.9" stopColor="#CED8E4" />
          <stop offset="1" stopColor="#E1E8F0" />
        </linearGradient>
      </defs>
    </svg>
  );
});

const AppleFountainNibSvg = React.memo<{ color: string; sizeLevel: number }>(
  ({ color, sizeLevel }) => {
    const bandH = Math.max(2.2, Math.min(5.2, 2.2 + ((sizeLevel - 5) / 95) * 3));

    return (
      <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
        {/* Classic split calligraphy fountain nib in warm champagne gold */}
        <path
          d="M23 3.2L29.6 15.2L27.4 22.4H18.6L16.4 15.2L23 3.2Z"
          fill="url(#pkStudioFountainNib)"
          stroke="rgba(120, 82, 24, 0.34)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Ink slit & breather heart/dot */}
        <line x1="23" y1="3.8" x2="23" y2="14.2" stroke="rgba(15, 23, 42, 0.55)" strokeWidth="0.75" />
        <circle cx="23" cy="14.8" r="1.35" fill={color} />
        <path d="M21.4 6.8L18.4 14.8L20.1 15.1L22.3 7.2Z" fill="rgba(255, 255, 255, 0.58)" />
        {/* Grip section collar */}
        <path
          d="M15.8 22.4H30.2L31.6 25.8H14.4L15.8 22.4Z"
          fill="url(#pkStudioFountainCollar)"
          stroke="rgba(15, 23, 42, 0.14)"
          strokeWidth="0.65"
        />
        {/* Deep satin lacquer fountain pen barrel */}
        <path
          d="M14.2 25.8H31.8V80H14.2V25.8Z"
          fill="url(#pkStudioFountainBarrel)"
          stroke="rgba(15, 23, 42, 0.14)"
          strokeWidth="0.7"
        />
        {/* Live ink collar */}
        <rect x="14.2" y="28.4" width="17.6" height={bandH + 2.4} fill={color} opacity="0.92" />
        <rect x="14.2" y="28.4" width="17.6" height={bandH + 2.4} fill="url(#pkStudioFountainWrap)" />
        {/* Brushed gold trim ring */}
        <rect x="14.2" y="38.2" width="17.6" height="1.8" fill="url(#pkStudioFountainNib)" />
        <rect x="16.9" y="26.6" width="2.2" height="52.4" rx="1.1" fill="rgba(255, 255, 255, 0.34)" />
        <defs>
          <linearGradient id="pkStudioFountainNib" x1="16.4" y1="13" x2="29.6" y2="13" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C8A054" />
            <stop offset="0.32" stopColor="#FBF0D1" />
            <stop offset="0.68" stopColor="#DFBC74" />
            <stop offset="1" stopColor="#9C752D" />
          </linearGradient>
          <linearGradient id="pkStudioFountainCollar" x1="14.4" y1="24.1" x2="31.6" y2="24.1" gradientUnits="userSpaceOnUse">
            <stop stopColor="#B8C4D0" />
            <stop offset="0.32" stopColor="#FFFFFF" />
            <stop offset="0.7" stopColor="#D6DFE9" />
            <stop offset="1" stopColor="#94A3B8" />
          </linearGradient>
          <linearGradient id="pkStudioFountainBarrel" x1="14.2" y1="40" x2="31.8" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D5DEE9" />
            <stop offset="0.28" stopColor="#FFFFFF" />
            <stop offset="0.66" stopColor="#F1F5F9" />
            <stop offset="0.92" stopColor="#C2CEDC" />
            <stop offset="1" stopColor="#DCE4EE" />
          </linearGradient>
          <linearGradient id="pkStudioFountainWrap" x1="14.2" y1="31" x2="31.8" y2="31" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(15, 23, 42, 0.18)" />
            <stop offset="0.3" stopColor="rgba(255, 255, 255, 0.32)" />
            <stop offset="0.9" stopColor="rgba(15, 23, 42, 0.2)" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
);

const ApplePencilNibSvg = React.memo<{ color: string; sizeLevel: number }>(({ color, sizeLevel }) => {
  const leadH = Math.max(2, Math.min(4.6, 2 + ((sizeLevel - 5) / 95) * 2.6));

  return (
    <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
      {/* Tapered graphite core tip */}
      <path
        d="M23 3.4L26.2 10.6C24.2 11.2 21.8 11.2 19.8 10.6L23 3.4Z"
        fill={color}
      />
      <path d="M22.4 4.8L20.9 9.8L22.1 10.1L22.9 5.0Z" fill="rgba(255, 255, 255, 0.32)" />
      {/* Warm carved natural cedar wood cone */}
      <path
        d="M19.8 10.6C21.8 11.2 24.2 11.2 26.2 10.6L31.4 23.2H14.6L19.8 10.6Z"
        fill="url(#pkStudioPencilWood)"
        stroke="rgba(120, 74, 38, 0.24)"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />
      {/* Cedar grain highlight */}
      <path d="M20.4 11.3L16.5 22.6H18.4L21.5 11.4Z" fill="rgba(255, 255, 255, 0.45)" />
      {/* Faceted Apple-Pencil matte barrel with subtle color jacket */}
      <path
        d="M14.6 23.2L18.5 21.8L23 23.2L27.5 21.8L31.4 23.2V80H14.6V23.2Z"
        fill="url(#pkStudioPencilBody)"
        stroke="rgba(15, 23, 42, 0.13)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* Facet ridge lines */}
      <line x1="18.6" y1="22.1" x2="18.6" y2="80" stroke="rgba(15, 23, 42, 0.08)" strokeWidth="0.6" />
      <line x1="27.4" y1="22.1" x2="27.4" y2="80" stroke="rgba(15, 23, 42, 0.08)" strokeWidth="0.6" />
      {/* Graphite color sleeve + thickness pill */}
      <rect x="14.6" y="27.5" width="16.8" height="4.4" fill={color} opacity="0.88" />
      <rect x="14.6" y="27.5" width="16.8" height="4.4" fill="url(#pkStudioPencilSheen)" />
      <rect x="19" y="36.4" width="8" height={leadH} rx={leadH / 2} fill={color} opacity="0.82" />
      <rect x="16.2" y="24" width="2" height="55" rx="1" fill="rgba(255, 255, 255, 0.35)" />
      <defs>
        <linearGradient id="pkStudioPencilWood" x1="14.6" y1="16.8" x2="31.4" y2="16.8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CFA57E" />
          <stop offset="0.34" stopColor="#F5DEC4" />
          <stop offset="0.72" stopColor="#DFBA95" />
          <stop offset="1" stopColor="#B8895E" />
        </linearGradient>
        <linearGradient id="pkStudioPencilBody" x1="14.6" y1="40" x2="31.4" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCE3EC" />
          <stop offset="0.3" stopColor="#FFFFFF" />
          <stop offset="0.65" stopColor="#F4F6FA" />
          <stop offset="0.92" stopColor="#C9D3DF" />
          <stop offset="1" stopColor="#DEE5EE" />
        </linearGradient>
        <linearGradient id="pkStudioPencilSheen" x1="14.6" y1="29.7" x2="31.4" y2="29.7" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(15, 23, 42, 0.14)" />
          <stop offset="0.3" stopColor="rgba(255, 255, 255, 0.34)" />
          <stop offset="0.9" stopColor="rgba(15, 23, 42, 0.18)" />
        </linearGradient>
      </defs>
    </svg>
  );
});

const AppleTapeStylusSvg = React.memo<{ color: string; sizeLevel: number }>(
  ({ color, sizeLevel }) => {
    const stripH = Math.max(3, Math.min(6.4, 3 + ((sizeLevel - 5) / 95) * 3.4));

    return (
      <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
        {/* Flat masking-tape applicator head */}
        <path
          d="M15.2 6.8C15.2 5.4 16.3 4.4 17.6 4.4H28.4C29.7 4.4 30.8 5.4 30.8 6.8L31.8 17.4H14.2L15.2 6.8Z"
          fill={color}
          stroke="rgba(15, 23, 42, 0.16)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Crisp tape edge highlight & subtle diagonal hatch motif */}
        <rect x="16.4" y="6.2" width="13.2" height="2.4" rx="1" fill="rgba(255, 255, 255, 0.56)" />
        <line x1="17.5" y1="15.5" x2="21.5" y2="10.2" stroke="rgba(255, 255, 255, 0.52)" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="22.5" y1="15.5" x2="26.5" y2="10.2" stroke="rgba(255, 255, 255, 0.52)" strokeWidth="1.2" strokeLinecap="round" />
        {/* Satin shoulder & roller bridge */}
        <path
          d="M13 17.4H33L34.6 24.4H11.4L13 17.4Z"
          fill="url(#pkStudioTapeShoulder)"
          stroke="rgba(15, 23, 42, 0.12)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Broad frosted-porcelain study tape dispenser body */}
        <path
          d="M11.4 24.4H34.6V80H11.4V24.4Z"
          fill="url(#pkStudioTapeBody)"
          stroke="rgba(15, 23, 42, 0.12)"
          strokeWidth="0.7"
        />
        {/* Pastel tape spool window & live width ribbon */}
        <rect
          x="13.6"
          y="28.6"
          width="18.8"
          height="16.4"
          rx="4.2"
          fill={color}
          opacity="0.78"
          stroke="rgba(15, 23, 42, 0.1)"
          strokeWidth="0.65"
        />
        <rect
          x="16"
          y={36.8 - stripH / 2}
          width="14"
          height={stripH}
          rx="1.6"
          fill="rgba(255, 255, 255, 0.85)"
        />
        <rect x="14.3" y="25.4" width="2.4" height="53.6" rx="1.2" fill="rgba(255, 255, 255, 0.4)" />
        <defs>
          <linearGradient id="pkStudioTapeShoulder" x1="11.4" y1="20.9" x2="34.6" y2="20.9" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D7E0EB" />
            <stop offset="0.3" stopColor="#FFFFFF" />
            <stop offset="0.66" stopColor="#F5F7FA" />
            <stop offset="1" stopColor="#D0DAE6" />
          </linearGradient>
          <linearGradient id="pkStudioTapeBody" x1="11.4" y1="40" x2="34.6" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DCE4EE" />
            <stop offset="0.28" stopColor="#FFFFFF" />
            <stop offset="0.64" stopColor="#F8FAFC" />
            <stop offset="0.92" stopColor="#CED8E4" />
            <stop offset="1" stopColor="#E1E8F0" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
);

const AppleLassoStylusSvg = React.memo<{ isActive: boolean }>(({ isActive }) => {
  return (
    <svg className="apple-nib-svg" viewBox="0 0 46 80" fill="none" aria-hidden="true">
      {/* Fine dashed selection loop above tip */}
      <ellipse
        cx="23"
        cy="10.2"
        rx="7.6"
        ry="5.2"
        stroke={isActive ? '#007AFF' : '#475569'}
        strokeWidth="1.5"
        strokeDasharray="3.2 2.2"
        fill={isActive ? 'rgba(0, 122, 255, 0.08)' : 'rgba(15, 23, 42, 0.03)'}
      />
      {/* Selection stylus nib cone */}
      <path
        d="M21 15.2H25L30.8 24H15.2L21 15.2Z"
        fill="url(#pkStudioLassoCone)"
        stroke="rgba(15, 23, 42, 0.14)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* Porcelain + slate barrel */}
      <path
        d="M14.6 24H31.4V80H14.6V24Z"
        fill="url(#pkStudioLassoBarrel)"
        stroke="rgba(15, 23, 42, 0.13)"
        strokeWidth="0.7"
      />
      {/* Diagonal candy-stripe dashed marquee collar (classic GoodNotes/Apple Lasso signature) */}
      <rect x="14.6" y="27.2" width="16.8" height="5.2" fill="#E2E8F0" />
      <path d="M15.4 32.4L18.8 27.2H21.2L17.8 32.4H15.4Z" fill="#007AFF" opacity="0.82" />
      <path d="M21.8 32.4L25.2 27.2H27.6L24.2 32.4H21.8Z" fill="#007AFF" opacity="0.82" />
      <path d="M28.2 32.4L31.4 27.5V31.2L30.6 32.4H28.2Z" fill="#007AFF" opacity="0.82" />
      {/* Grip band */}
      <rect x="17" y="37" width="12" height="2" rx="1" fill="rgba(15, 23, 42, 0.14)" />
      <rect x="17" y="24.8" width="2.2" height="54.2" rx="1.1" fill="rgba(255, 255, 255, 0.44)" />
      <defs>
        <linearGradient id="pkStudioLassoCone" x1="15.2" y1="19.6" x2="30.8" y2="19.6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D3DCE6" />
          <stop offset="0.32" stopColor="#FFFFFF" />
          <stop offset="0.7" stopColor="#EFF4F8" />
          <stop offset="1" stopColor="#C1CDDA" />
        </linearGradient>
        <linearGradient id="pkStudioLassoBarrel" x1="14.6" y1="40" x2="31.4" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCE4EE" />
          <stop offset="0.28" stopColor="#FFFFFF" />
          <stop offset="0.65" stopColor="#F8FAFC" />
          <stop offset="0.92" stopColor="#CED8E4" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
    </svg>
  );
});

interface AppleOrbLiveToolProps {
  activeTool: AnnotationTool;
  penColor: string;
  penSizeLevel: number;
  fountainColor: string;
  fountainSizeLevel: number;
  pencilColor: string;
  pencilSizeLevel: number;
  highlighterColor: string;
  highlighterSizeLevel: number;
  tapeColor: string;
  tapeSizeLevel: number;
  laserColor: string;
  laserSizeLevel: number;
  eraserSizeLevel: number;
  eraserHighlighterOnly: boolean;
}

/**
 * iPadOS PKToolPicker minimized orb glyph:
 * Displays the live currently selected tool peeking up from the frosted circle,
 * or the calm neutral Apple Pencil when in Browse (cursor) mode.
 */
const AppleOrbLiveTool = React.memo<AppleOrbLiveToolProps>((props) => {
  const { activeTool } = props;
  if (activeTool === 'cursor') {
    return (
      <span className="apple-orb-pen-wave-wrap" aria-hidden="true">
        <AppleOrbPenGlyphSvg />
      </span>
    );
  }
  return (
    <span className="apple-orb-live-tool" aria-hidden="true">
      {activeTool === 'pen' && (
        <ApplePenNibSvg color={props.penColor} sizeLevel={props.penSizeLevel} />
      )}
      {activeTool === 'fountain' && (
        <AppleFountainNibSvg color={props.fountainColor} sizeLevel={props.fountainSizeLevel} />
      )}
      {activeTool === 'pencil' && (
        <ApplePencilNibSvg color={props.pencilColor} sizeLevel={props.pencilSizeLevel} />
      )}
      {activeTool === 'highlighter' && (
        <AppleHighlighterNibSvg
          color={props.highlighterColor}
          sizeLevel={props.highlighterSizeLevel}
        />
      )}
      {activeTool === 'tape' && (
        <AppleTapeStylusSvg color={props.tapeColor} sizeLevel={props.tapeSizeLevel} />
      )}
      {activeTool === 'laser' && (
        <AppleLaserStylusSvg
          color={props.laserColor}
          sizeLevel={props.laserSizeLevel}
          isActive={true}
        />
      )}
      {activeTool === 'eraser' && (
        <AppleEraserNibSvg
          sizeLevel={props.eraserSizeLevel}
          highlighterOnly={props.eraserHighlighterOnly}
        />
      )}
      {activeTool === 'lasso' && <AppleLassoStylusSvg isActive={true} />}
    </span>
  );
});

/**
 * Single Unified External Dock Thickness Roller (5%..100% in 20 crisp 5% magnetic detents).
 */
const DOCK_ROLLER_INSET_PX = 8;

const TOOL_SHORT_NAMES: Record<SizableAnnotationTool, string> = {
  pen: 'القلم',
  fountain: 'الخطّاط',
  pencil: 'الرصاص',
  highlighter: 'التظليل',
  tape: 'التحفيظ',
  eraser: 'الممحاة',
};

const TOOL_SIZE_TITLES: Record<SizableAnnotationTool, string> = {
  pen: 'سُمك القلم',
  fountain: 'سُمك الخطّاط',
  pencil: 'سُمك الرصاص',
  highlighter: 'عرض التظليل',
  tape: 'عرض الشريط',
  eraser: 'حجم الممحاة',
};

const SLOT_INDICES: readonly SizeSlotIndex[] = [0, 1, 2];

function renderSlotPreviewStage(
  tool: SizableAnnotationTool,
  color: string,
  realPx: number
): React.ReactNode {
  if (tool === 'pen' || tool === 'fountain' || tool === 'pencil') {
    const dotPx = Math.max(2, Math.min(22, Math.round(realPx)));
    return (
      <span
        className="apple-size-dot"
        style={{
          width: `${dotPx}px`,
          height: `${dotPx}px`,
          backgroundColor: color,
          opacity: tool === 'pencil' ? 0.84 : 1,
        }}
      />
    );
  }
  if (tool === 'highlighter') {
    return (
      <span className="apple-callout-hl-stage">
        <span className="apple-callout-hl-lines" />
        <span
          className="apple-callout-hl-bar"
          style={{
            height: `${Math.max(6, Math.min(26, Math.round(realPx * 0.48)))}px`,
            backgroundColor: color,
          }}
        />
      </span>
    );
  }
  if (tool === 'tape') {
    return (
      <span className="apple-callout-hl-stage">
        <span className="apple-callout-hl-lines" />
        <span
          className="apple-callout-tape-bar"
          style={{
            height: `${Math.max(6, Math.min(24, Math.round(realPx * 0.45)))}px`,
            backgroundColor: color,
          }}
        />
      </span>
    );
  }
  return (
    <span
      className="apple-eraser-preview"
      style={{
        width: `${Math.max(9, Math.min(28, Math.round(realPx * 0.44)))}px`,
        height: `${Math.max(9, Math.min(28, Math.round(realPx * 0.44)))}px`,
      }}
    />
  );
}

interface CalmMagneticSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  magnetStep?: number;
  ariaLabel: string;
  ariaValueText?: string;
  onActivate?: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onChange: (nextVal: number) => void;
}

/**
 * Unified calm RTL slider with smooth 1% drag
 * and magnetic 5-degree detents (5, 10, 15, 20...).
 * Used consistently across thickness, pen opacity, and highlighter transparency controls.
 */
const CalmMagneticSlider: React.FC<CalmMagneticSliderProps> = ({
  value,
  min,
  max,
  step = SIZE_DIAL_STEP,
  magnetStep = 5,
  ariaLabel,
  ariaValueText,
  onActivate,
  onInteractionStart,
  onInteractionEnd,
  onChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const trackRectRef = useRef<DOMRect | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const dragRatioRef = useRef<number | null>(null);
  const lockedAnchorRef = useRef<number | null>(null);
  const dragSpeedRef = useRef<number>(0.25);
  const lastSampleRef = useRef<{ x: number; t: number } | null>(null);
  const wheelAccumRef = useRef(0);

  const valueRef = useRef(value);
  valueRef.current = value;

  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;

  const onInteractionEndRef = useRef(onInteractionEnd);
  onInteractionEndRef.current = onInteractionEnd;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const pulseHapticDetent = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(4);
      }
    } catch {
      // Ignore vibration permission/support restrictions
    }
  }, []);

  const commitValue = useCallback(
    (nextVal: number) => {
      onActivateRef.current?.();
      const clamped = Math.max(min, Math.min(max, Math.round(nextVal)));
      if (clamped !== valueRef.current) {
        valueRef.current = clamped;
        onChangeRef.current(clamped);
      }
    },
    [min, max]
  );

  const stepToAnchor = useCallback(
    (dir: number) => {
      const cur = valueRef.current;
      const next =
        dir > 0
          ? Math.min(max, (Math.floor(cur / magnetStep) + 1) * magnetStep)
          : Math.max(min, (Math.ceil(cur / magnetStep) - 1) * magnetStep);
      commitValue(next);
    },
    [min, max, magnetStep, commitValue]
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const primaryDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : -e.deltaY;
      if (primaryDelta === 0) return;

      if (Math.abs(primaryDelta) >= 34) {
        wheelAccumRef.current = 0;
        stepToAnchor(primaryDelta > 0 ? 1 : -1);
        return;
      }

      wheelAccumRef.current += primaryDelta;
      const threshold = 18;
      if (Math.abs(wheelAccumRef.current) >= threshold) {
        const dir = wheelAccumRef.current > 0 ? 1 : -1;
        wheelAccumRef.current = 0;
        stepToAnchor(dir);
      }
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, [stepToAnchor]);

  const updateFromClientX = useCallback(
    (clientX: number, immediateCommit: boolean) => {
      const trackEl = trackRef.current;
      if (!trackEl) return;
      const rect = trackRectRef.current ?? trackEl.getBoundingClientRect();
      const usable = Math.max(1, rect.width - DOCK_ROLLER_INSET_PX * 2);
      const progress = Math.max(
        0,
        Math.min(1, (rect.right - DOCK_ROLLER_INSET_PX - clientX) / usable)
      );
      const rawVal = min + progress * (max - min);
      const prevLockedAnchor = lockedAnchorRef.current;
      const { value: snappedVal, visualValue, lockedAnchor } = applyMagneticSnap(rawVal, min, max, {
        magnetStep,
        lockedAnchor: prevLockedAnchor,
        dragSpeedPxPerMs: dragSpeedRef.current,
      });
      lockedAnchorRef.current = lockedAnchor;

      if (lockedAnchor !== null && lockedAnchor !== prevLockedAnchor && snappedVal !== valueRef.current) {
        pulseHapticDetent();
      }

      const visualRatio = Math.max(0, Math.min(1, (visualValue - min) / Math.max(1, max - min)));

      dragRatioRef.current = visualRatio;
      trackEl.style.setProperty('--dial-ratio', visualRatio.toFixed(4));

      if (immediateCommit) {
        if (dragRafRef.current !== null) {
          window.cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        pendingValueRef.current = null;
        commitValue(snappedVal);
        return;
      }

      pendingValueRef.current = snappedVal;
      if (dragRafRef.current === null) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const nextNow = pendingValueRef.current;
          pendingValueRef.current = null;
          if (nextNow !== null) {
            commitValue(nextNow);
          }
        });
      }
    },
    [min, max, magnetStep, commitValue, pulseHapticDetent]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    trackRectRef.current = e.currentTarget.getBoundingClientRect();
    lockedAnchorRef.current = null;
    dragSpeedRef.current = 0.25;
    lastSampleRef.current = { x: e.clientX, t: performance.now() };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic capture errors
    }
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);
    onInteractionStartRef.current?.();
    updateFromClientX(e.clientX, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const now = performance.now();
    const prevSample = lastSampleRef.current;
    if (prevSample) {
      const dx = Math.abs(e.clientX - prevSample.x);
      const dt = Math.max(1, now - prevSample.t);
      if (dx >= 0.4) {
        const instantSpeed = dx / dt;
        dragSpeedRef.current = 0.35 * instantSpeed + 0.65 * dragSpeedRef.current;
        lastSampleRef.current = { x: e.clientX, t: now };
      }
    } else {
      lastSampleRef.current = { x: e.clientX, t: now };
    }
    updateFromClientX(e.clientX, false);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    updateFromClientX(e.clientX, true);
    onInteractionEndRef.current?.();
    activePointerIdRef.current = null;
    trackRectRef.current = null;
    dragRatioRef.current = null;
    lockedAnchorRef.current = null;
    dragSpeedRef.current = 0.25;
    lastSampleRef.current = null;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore capture release errors
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const arrowDelta = e.shiftKey ? 1 : step;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      commitValue(value + arrowDelta);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      commitValue(value - arrowDelta);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      commitValue(value + step * 3);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      commitValue(value - step * 3);
    } else if (e.key === 'Home') {
      e.preventDefault();
      commitValue(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      commitValue(max);
    }
  };

  const ratio = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  const activeRatio = isDragging && dragRatioRef.current !== null ? dragRatioRef.current : ratio;

  return (
    <div
      ref={trackRef}
      className={`apple-dock-roller-track ${isDragging ? 'is-dragging' : ''}`}
      style={{ '--dial-ratio': activeRatio.toFixed(4) } as React.CSSProperties}
      dir="rtl"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={ariaValueText}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      <div className="apple-dock-roller-fill" aria-hidden="true" />
      <div className="apple-dock-roller-thumb" aria-hidden="true" />
    </div>
  );
};

interface DockThicknessSlotsProps {
  tool: SizableAnnotationTool;
  isStandby: boolean;
  isPulsing: boolean;
  suppressPreview: boolean;
  sizeSlots: [number, number, number];
  activeSlot: SizeSlotIndex;
  editingSlot: SizeSlotIndex | null;
  color: string;
  dockSide?: 'bottom' | 'left' | 'right';
  isTopHalf?: boolean;
  onActivateTool: () => void;
  onSelectSlot: (slot: SizeSlotIndex) => void;
  onEditingSlotChange: (slot: SizeSlotIndex | null) => void;
  onChangeSlotLevel: (slot: SizeSlotIndex, nextLevel: number) => void;
}

const DockThicknessSlots: React.FC<DockThicknessSlotsProps> = ({
  tool,
  isStandby,
  isPulsing,
  suppressPreview,
  sizeSlots,
  activeSlot,
  editingSlot,
  color,
  dockSide = 'bottom',
  isTopHalf = false,
  onActivateTool,
  onSelectSlot,
  onEditingSlotChange,
  onChangeSlotLevel,
}) => {
  const [transientSlot, setTransientSlot] = useState<SizeSlotIndex | null>(null);

  const slotsTrayRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelSlotRef = useRef<SizeSlotIndex | null>(null);

  const slotLevels: [number, number, number] = [
    pxToSizeLevel(tool, sizeSlots[0]),
    pxToSizeLevel(tool, sizeSlots[1]),
    pxToSizeLevel(tool, sizeSlots[2]),
  ];

  const slotLevelsRef = useRef(slotLevels);
  slotLevelsRef.current = slotLevels;

  const isStandbyRef = useRef(isStandby);
  isStandbyRef.current = isStandby;

  const onActivateToolRef = useRef(onActivateTool);
  onActivateToolRef.current = onActivateTool;

  const onChangeSlotLevelRef = useRef(onChangeSlotLevel);
  onChangeSlotLevelRef.current = onChangeSlotLevel;

  const flashSlotCallout = useCallback((slot: SizeSlotIndex) => {
    setTransientSlot(slot);
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      setTransientSlot(null);
      previewTimerRef.current = null;
    }, 760);
  }, []);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  const commitSlotLevel = useCallback(
    (slot: SizeSlotIndex, nextRaw: number, showTransient = false, snapToStep = false) => {
      if (isStandbyRef.current) {
        onActivateToolRef.current();
      }
      const nextLevel = snapToStep ? snapSizeLevel(nextRaw) : clampSizeLevel(nextRaw);
      if (nextLevel !== slotLevelsRef.current[slot]) {
        onChangeSlotLevelRef.current(slot, nextLevel);
      }
      if (showTransient) {
        flashSlotCallout(slot);
      }
    },
    [flashSlotCallout]
  );

  // Native non-passive wheel listener over the 3 external dot buttons (steps +/-5%)
  useEffect(() => {
    const el = slotsTrayRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const slotBtnHit =
        e.target instanceof Element ? e.target.closest<HTMLElement>('[data-slot-index]') : null;
      if (!slotBtnHit) return;
      const idxAttr = slotBtnHit.dataset.slotIndex;
      if (idxAttr === undefined) return;
      const slotIdx = Number(idxAttr) as SizeSlotIndex;
      if (slotIdx !== 0 && slotIdx !== 1 && slotIdx !== 2) return;

      e.preventDefault();
      e.stopPropagation();

      const primaryDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : -e.deltaY;
      if (primaryDelta === 0) return;

      if (wheelSlotRef.current !== slotIdx) {
        wheelSlotRef.current = slotIdx;
        wheelAccumRef.current = 0;
      }

      if (Math.abs(primaryDelta) >= 36) {
        wheelAccumRef.current = 0;
        const dir = primaryDelta > 0 ? 1 : -1;
        commitSlotLevel(slotIdx, slotLevelsRef.current[slotIdx] + dir * SIZE_DIAL_STEP, true, true);
        return;
      }

      wheelAccumRef.current += primaryDelta;
      const threshold = 22;
      if (Math.abs(wheelAccumRef.current) >= threshold) {
        const steps = Math.trunc(wheelAccumRef.current / threshold);
        wheelAccumRef.current -= steps * threshold;
        commitSlotLevel(
          slotIdx,
          slotLevelsRef.current[slotIdx] + steps * SIZE_DIAL_STEP,
          true,
          true
        );
      }
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, [commitSlotLevel]);

  const handleSlotClick = (idx: SizeSlotIndex) => {
    if (isStandby) {
      onSelectSlot(idx);
      onActivateTool();
      onEditingSlotChange(null);
      return;
    }
    if (activeSlot !== idx) {
      onSelectSlot(idx);
      if (editingSlot !== null) {
        onEditingSlotChange(idx);
      }
      return;
    }
    onEditingSlotChange(editingSlot === idx ? null : idx);
  };

  const handleSlotContextMenu = (e: React.MouseEvent, idx: SizeSlotIndex) => {
    e.preventDefault();
    if (isStandby) {
      onActivateTool();
    }
    onSelectSlot(idx);
    onEditingSlotChange(idx);
  };

  const accentColor = tool === 'eraser' ? '#EC4899' : color;
  const calloutSlot = editingSlot === null ? transientSlot : null;
  const showCallout = !suppressPreview && calloutSlot !== null;

  const editorLevel = editingSlot !== null ? slotLevels[editingSlot] : SIZE_DIAL_MIN;
  const editorRealPx = editingSlot !== null ? sizeLevelToPx(tool, editorLevel) : 4;

  const sideInwardOffset =
    dockSide === 'left'
      ? { x: -14, y: 0 }
      : dockSide === 'right'
        ? { x: 14, y: 0 }
        : isTopHalf
          ? { x: 0, y: -12 }
          : { x: 0, y: 12 };

  return (
    <div
      ref={slotsTrayRef}
      className={`apple-thickness-slots ${isStandby ? 'is-standby' : ''} ${
        isPulsing ? 'is-pulsing' : ''
      }`}
      style={{ '--dial-accent': accentColor } as React.CSSProperties}
      role="group"
      aria-label={`نقاط سُمك ${TOOL_SHORT_NAMES[tool]} الثلاثة`}
    >
      {/* Transient wheel preview callout when scrolling directly over a dot */}
      <div className="apple-dock-roller-callout-anchor" aria-hidden="true">
        <AnimatePresence>
          {showCallout && calloutSlot !== null && (
            <motion.div
              className="apple-dock-roller-callout"
              initial={{ opacity: 0, x: sideInwardOffset.x * 0.4, y: sideInwardOffset.y * 0.4, scale: 0.97 }}
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                transition: APPLE_POPOVER_SPRING,
              }}
              exit={{
                opacity: 0,
                x: sideInwardOffset.x * 0.25,
                y: sideInwardOffset.y * 0.25,
                scale: 0.98,
                transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
              }}
            >
              <div className="apple-roller-callout-stage">
                {renderSlotPreviewStage(tool, color, sizeLevelToPx(tool, slotLevels[calloutSlot]))}
              </div>
              <span className="apple-roller-callout-pct">
                {toArabicDigits(slotLevels[calloutSlot])}٪
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Individual Slot Thickness Editor Popover */}
      <div className="apple-slot-editor-anchor">
        <AnimatePresence>
          {editingSlot !== null && (
            <motion.div
              className="apple-slot-editor-popover"
              role="dialog"
              aria-label={`ضبط سُمك ${toArabicDigits(editingSlot + 1)} لأداة ${TOOL_SHORT_NAMES[tool]}`}
              initial={{ opacity: 0, x: sideInwardOffset.x * 0.4, y: sideInwardOffset.y * 0.4, scale: 0.97 }}
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                transition: APPLE_POPOVER_SPRING,
              }}
              exit={{
                opacity: 0,
                x: sideInwardOffset.x * 0.25,
                y: sideInwardOffset.y * 0.25,
                scale: 0.98,
                transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
              }}
            >
              <div className="apple-slot-editor-head">
                <div className="apple-roller-callout-stage">
                  {renderSlotPreviewStage(tool, color, editorRealPx)}
                </div>
                <span className="apple-roller-callout-pct">{toArabicDigits(editorLevel)}٪</span>
              </div>

              <CalmMagneticSlider
                value={editorLevel}
                min={SIZE_DIAL_MIN}
                max={SIZE_DIAL_MAX}
                step={SIZE_DIAL_STEP}
                magnetStep={5}
                ariaLabel={`${TOOL_SIZE_TITLES[tool]} ${toArabicDigits(editingSlot + 1)} من ٥٪ إلى ١٠٠٪`}
                ariaValueText={`${TOOL_SIZE_TITLES[tool]} ${toArabicDigits(editorLevel)} بالمئة`}
                onActivate={() => {
                  if (isStandbyRef.current) {
                    onActivateToolRef.current();
                  }
                }}
                onChange={(nextLvl) => commitSlotLevel(editingSlot, nextLvl, false, false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3 Pure Clean Proportional Dot Buttons (uniform circle shape across tools, no numbers) */}
      <div className="apple-thickness-slots-group">
        {SLOT_INDICES.map((idx) => {
          const level = slotLevels[idx];
          const ratio = (level - SIZE_DIAL_MIN) / (SIZE_DIAL_MAX - SIZE_DIAL_MIN);
          const dotSizePx = Math.round(5 + ratio * 12);
          const isSelected = !isStandby && activeSlot === idx;
          const isEditingThis = editingSlot === idx;
          const slotNumAr = toArabicDigits(idx + 1);
          const levelAr = toArabicDigits(level);
          return (
            <button
              key={idx}
              type="button"
              data-slot-index={idx}
              className={`apple-thickness-slot-btn ${isSelected ? 'is-active' : ''} ${
                isEditingThis ? 'is-editing' : ''
              }`}
              aria-pressed={isSelected}
              aria-expanded={isEditingThis}
              onClick={() => handleSlotClick(idx)}
              onContextMenu={(e) => handleSlotContextMenu(e, idx)}
              title={
                isSelected
                  ? `${TOOL_SIZE_TITLES[tool]} ${slotNumAr} (${levelAr}٪) · اضغط مجدداً لضبط هذا المقاس أو اسحب بالعجلة`
                  : `${TOOL_SIZE_TITLES[tool]} ${slotNumAr} (${levelAr}٪) · اختصار (${idx + 1}) · كليك يمين للتعديل`
              }
              aria-label={`${TOOL_SIZE_TITLES[tool]} ${slotNumAr}: ${levelAr} بالمئة`}
            >
              <span
                className="apple-thickness-slot-dot"
                style={{ width: `${dotSizePx}px`, height: `${dotSizePx}px` }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const COLOR_TOOL_TITLES: Record<ColorableAnnotationTool, string> = {
  pen: 'لون القلم',
  fountain: 'لون الخطّاط',
  pencil: 'لون الرصاص',
  highlighter: 'لون التظليل',
  tape: 'لون الشريط',
  laser: 'لون الليزر',
};

const COLOR_SLOT_INDICES: readonly ColorSlotIndex[] = [0, 1, 2];

interface DockColorSlotsProps {
  tool: ColorableAnnotationTool;
  isStandby: boolean;
  isHidden?: boolean;
  colorSlots: [string, string, string];
  activeSlot: ColorSlotIndex;
  editingSlot: ColorSlotIndex | null;
  palette: readonly ColorSwatch[];
  dockSide?: 'bottom' | 'left' | 'right';
  isTopHalf?: boolean;
  onActivateTool: () => void;
  onSelectSlot: (slot: ColorSlotIndex) => void;
  onEditingSlotChange: (slot: ColorSlotIndex | null) => void;
  onChangeSlotColor: (slot: ColorSlotIndex, hex: string) => void;
}

const DockColorSlots: React.FC<DockColorSlotsProps> = ({
  tool,
  isStandby,
  isHidden = false,
  colorSlots,
  activeSlot,
  editingSlot,
  palette,
  dockSide = 'bottom',
  isTopHalf = false,
  onActivateTool,
  onSelectSlot,
  onEditingSlotChange,
  onChangeSlotColor,
}) => {
  const handleSlotClick = (idx: ColorSlotIndex) => {
    if (isHidden) return;
    if (isStandby) {
      onSelectSlot(idx);
      onActivateTool();
      onEditingSlotChange(null);
      return;
    }
    if (activeSlot !== idx) {
      onSelectSlot(idx);
      if (editingSlot !== null) {
        onEditingSlotChange(idx);
      }
      return;
    }
    onEditingSlotChange(editingSlot === idx ? null : idx);
  };

  const handleSlotContextMenu = (e: React.MouseEvent, idx: ColorSlotIndex) => {
    e.preventDefault();
    if (isHidden) return;
    if (isStandby) {
      onActivateTool();
    }
    onSelectSlot(idx);
    onEditingSlotChange(idx);
  };

  const resolveColorName = (hex: string) =>
    palette.find((s) => s.hex.toLowerCase() === hex.toLowerCase())?.label ?? hex;

  const sideInwardOffset =
    dockSide === 'left'
      ? { x: -14, y: 0 }
      : dockSide === 'right'
        ? { x: 14, y: 0 }
        : isTopHalf
          ? { x: 0, y: -12 }
          : { x: 0, y: 12 };

  return (
    <div
      className={`apple-color-slots ${isStandby ? 'is-standby' : ''} ${
        isHidden ? 'is-hidden' : ''
      }`}
      role="group"
      aria-label={`ألوان ${COLOR_TOOL_TITLES[tool]} الثلاثة`}
      aria-hidden={isHidden}
    >
      <div className="apple-color-editor-anchor">
        <AnimatePresence>
          {!isHidden && editingSlot !== null && (
            <motion.div
              className="apple-color-editor-popover"
              role="dialog"
              aria-label={`تغيير ${COLOR_TOOL_TITLES[tool]} (${toArabicDigits(editingSlot + 1)})`}
              initial={{ opacity: 0, x: sideInwardOffset.x * 0.4, y: sideInwardOffset.y * 0.4, scale: 0.97 }}
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                transition: APPLE_POPOVER_SPRING,
              }}
              exit={{
                opacity: 0,
                x: sideInwardOffset.x * 0.25,
                y: sideInwardOffset.y * 0.25,
                scale: 0.98,
                transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
              }}
            >
              <div className="apple-swatch-row" role="group" aria-label="اختيار لون الخانة">
                {palette.map((swatch) => {
                  const isCurrent =
                    colorSlots[editingSlot].toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      className={`apple-swatch-btn ${isCurrent ? 'is-selected' : ''}`}
                      style={{ '--swatch-hex': swatch.hex } as React.CSSProperties}
                      onClick={() => {
                        onChangeSlotColor(editingSlot, swatch.hex);
                        onEditingSlotChange(null);
                      }}
                      title={swatch.label}
                      aria-label={swatch.label}
                      aria-pressed={isCurrent}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="apple-color-slots-group">
        {COLOR_SLOT_INDICES.map((idx) => {
          const hex = colorSlots[idx];
          const isSelected = !isStandby && !isHidden && activeSlot === idx;
          const isEditingThis = editingSlot === idx;
          const slotNumAr = toArabicDigits(idx + 1);
          const colorLabel = resolveColorName(hex);
          return (
            <button
              key={idx}
              type="button"
              disabled={isHidden}
              tabIndex={isHidden ? -1 : 0}
              className={`apple-color-slot-btn ${isSelected ? 'is-active' : ''} ${
                isEditingThis ? 'is-editing' : ''
              }`}
              style={{ '--slot-color': hex } as React.CSSProperties}
              aria-pressed={isSelected}
              aria-expanded={!isHidden && isEditingThis}
              onClick={() => handleSlotClick(idx)}
              onContextMenu={(e) => handleSlotContextMenu(e, idx)}
              title={
                isSelected
                  ? `${colorLabel} · اضغط مجدداً لتبديل اللون`
                  : `${colorLabel} · كليك يمين لتخصيص الخانة ${slotNumAr}`
              }
              aria-label={`${COLOR_TOOL_TITLES[tool]} ${slotNumAr}: ${colorLabel}`}
            >
              <span className="apple-color-slot-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const TOOL_LABELS: Record<AnnotationTool, string> = {
  cursor: 'تصفح',
  lasso: 'تحديد حر',
  pen: 'قلم حبر',
  fountain: 'قلم خطّاط',
  pencil: 'قلم رصاص',
  highlighter: 'تظليل أبل',
  tape: 'شريط التحفيظ',
  laser: 'ليزر ضوئي',
  eraser: 'ممحاة',
};

const ORB_STORAGE_KEY = 'safara_pen_orb_pos_v3';
const DOCK_STORAGE_KEY = 'safara_pen_dock_placement_v1';
const ORB_MARGIN_X = 32;
const ORB_BOTTOM_MARGIN = 26;
const SIDE_DOCK_MARGIN_X = 28;
const BOTTOM_DOCK_MARGIN = 22;
const ORB_SIZE = 58;
const SIDE_DOCK_EST_H = 440;

const APPLE_CALM_EASE = [0.22, 1, 0.36, 1] as const;
const APPLE_IPAD_EASE = [0.32, 0.72, 0, 1] as const;

const APPLE_DOCK_SPRING = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 32,
  mass: 0.78,
};

const APPLE_ORB_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 31,
  mass: 0.76,
};

const APPLE_SNAP_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 32,
  mass: 0.82,
};

const APPLE_CONTAINER_SPRING = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 33,
  mass: 0.8,
};

const APPLE_MORPH_SPRING = {
  type: 'spring' as const,
  stiffness: 330,
  damping: 32,
  mass: 0.82,
};

const APPLE_POPOVER_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 30,
  mass: 0.72,
};

const APPLE_EXIT_EASE = [0.32, 0, 0.67, 0] as const;

let morphGhostSeq = 0;

function createMorphGhostClone(
  sourceEl: HTMLElement | null,
  fromW: number,
  fromH: number
): HTMLElement | null {
  if (!sourceEl || typeof document === 'undefined' || fromW <= 0 || fromH <= 0) {
    return null;
  }
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  const uid = `_g${++morphGhostSeq}`;
  const idMap = new Map<string, string>();
  clone.querySelectorAll<HTMLElement>('[id]').forEach((node) => {
    const oldId = node.getAttribute('id');
    if (!oldId) return;
    const nextId = `${oldId}${uid}`;
    idMap.set(oldId, nextId);
    node.setAttribute('id', nextId);
  });
  if (clone.id) {
    const nextId = `${clone.id}${uid}`;
    idMap.set(clone.id, nextId);
    clone.setAttribute('id', nextId);
  }
  if (idMap.size > 0) {
    const rewriteUrlRefs = (val: string) =>
      val.replace(/url\((['"]?)#([^)'"]+)\1\)/g, (full, q, refId) => {
        const mapped = idMap.get(refId);
        return mapped ? `url(${q}#${mapped}${q})` : full;
      });
    clone.querySelectorAll('*').forEach((el) => {
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        const v = attr.value;
        if (!v) continue;
        if (v.includes('url(#')) {
          el.setAttribute(attr.name, rewriteUrlRefs(v));
        } else if (
          (attr.name === 'href' || attr.name === 'xlink:href') &&
          v.startsWith('#')
        ) {
          const mapped = idMap.get(v.slice(1));
          if (mapped) {
            el.setAttribute(attr.name, `#${mapped}`);
          }
        }
      }
    });
  }
  clone
    .querySelectorAll(
      '.apple-dock-settings-popover, .apple-shortcuts-popover, .apple-slot-editor-anchor, .apple-color-editor-anchor, .apple-dock-roller-callout-anchor, .apple-nibs-peek-btn'
    )
    .forEach((el) => el.remove());
  clone.querySelectorAll('button, [tabindex]').forEach((el) => {
    el.setAttribute('tabindex', '-1');
  });
  clone.classList.add('apple-dock-morph-ghost');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.setProperty('--morph-from-w', `${fromW}px`);
  clone.style.setProperty('--morph-from-h', `${fromH}px`);
  clone.style.width = `${fromW}px`;
  clone.style.height = `${fromH}px`;
  clone.style.opacity = '1';
  clone.style.transform = 'none';
  return clone;
}

function prefersReducedMotionNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rubberBandClamp(val: number, min: number, max: number, maxOvershoot = 22): number {
  if (val < min) {
    const over = min - val;
    return min - (over * maxOvershoot) / (over + maxOvershoot * 2.2);
  }
  if (val > max) {
    const over = val - max;
    return max + (over * maxOvershoot) / (over + maxOvershoot * 2.2);
  }
  return val;
}

type OrbPos = { side: 'left' | 'right' };

type DockPlacement =
  | { mode: 'bottom' }
  | { mode: 'left' }
  | { mode: 'right' };

type DockDropTarget =
  | { kind: 'side'; side: 'left' | 'right'; topPx: number; h: number }
  | { kind: 'bottom-edge'; x: number; w: number; h: number }
  | { kind: 'orb'; left: number; top: number; side: 'left' | 'right' };

function isSameDropPreview(a: DockDropTarget | null, b: DockDropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'orb' && b.kind === 'orb') {
    return a.side === b.side && Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3;
  }
  if (a.kind === 'side' && b.kind === 'side') {
    return a.side === b.side && Math.abs(a.topPx - b.topPx) < 4 && Math.abs(a.h - b.h) < 2;
  }
  if (a.kind === 'bottom-edge' && b.kind === 'bottom-edge') {
    return (
      Math.abs(a.x - b.x) < 4 &&
      Math.abs(a.w - b.w) < 2 &&
      Math.abs(a.h - b.h) < 2
    );
  }
  return false;
}

function getLayoutViewport(): { vw: number; vh: number } {
  if (typeof window === 'undefined') return { vw: 1280, vh: 800 };
  const docEl = document.documentElement;
  const vw = docEl && docEl.clientWidth > 0 ? docEl.clientWidth : window.innerWidth;
  const vh = docEl && docEl.clientHeight > 0 ? docEl.clientHeight : window.innerHeight;
  return { vw, vh };
}

function getOrbCornerMargins(vw?: number): { x: number; bottom: number; orbSize: number } {
  const width = vw ?? getLayoutViewport().vw;
  const isNarrow = width <= 640;
  return {
    x: isNarrow ? 20 : ORB_MARGIN_X,
    bottom: isNarrow ? 20 : ORB_BOTTOM_MARGIN,
    orbSize: isNarrow ? 52 : ORB_SIZE,
  };
}

function clampOrbCoords(rawLeft: number, rawTop: number, vw?: number, vh?: number): { left: number; top: number } {
  const layout = getLayoutViewport();
  const width = vw ?? layout.vw;
  const height = vh ?? layout.vh;
  const { orbSize } = getOrbCornerMargins(width);
  const minLeft = 10;
  const maxLeft = Math.max(minLeft, width - orbSize - 10);
  const minTop = 14;
  const maxTop = Math.max(minTop, height - orbSize - 14);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, rawLeft)),
    top: Math.max(minTop, Math.min(maxTop, rawTop)),
  };
}

function resolveOrbCoords(pos: OrbPos, vw?: number, vh?: number): { left: number; top: number } {
  const layout = getLayoutViewport();
  const width = vw ?? layout.vw;
  const height = vh ?? layout.vh;
  const { x, bottom, orbSize } = getOrbCornerMargins(width);
  const left = pos.side === 'right' ? width - orbSize - x : x;
  const top = height - orbSize - bottom;
  return clampOrbCoords(left, top, width, height);
}

function resolveMagneticOrbSide(
  clientX: number,
  vw: number,
  sourceMode?: 'bottom' | 'left' | 'right'
): 'left' | 'right' {
  if (sourceMode === 'left') {
    return clientX >= vw * 0.56 ? 'right' : 'left';
  }
  if (sourceMode === 'right') {
    return clientX <= vw * 0.44 ? 'left' : 'right';
  }
  return clientX < vw * 0.5 ? 'left' : 'right';
}

function getDockCornerPocketMetrics(vw: number, vh: number): {
  zoneW: number;
  zoneTop: number;
  exitW: number;
  exitTop: number;
} {
  const isWide = vw >= 640;
  const zoneW = isWide
    ? Math.min(126, Math.max(96, vw * 0.09))
    : Math.min(128, Math.max(88, vw * 0.22));
  const zoneTop = isWide
    ? Math.max(vh * 0.83, vh - 104)
    : Math.max(vh * 0.81, vh - 106);
  return {
    zoneW,
    zoneTop,
    exitW: zoneW + 22,
    exitTop: Math.max(isWide ? vh * 0.79 : vh * 0.77, zoneTop - 20),
  };
}

function detectCornerMagnet(
  clientX: number,
  clientY: number,
  vw: number,
  vh: number,
  prevSide: 'left' | 'right' | null = null,
  isDockDrag = false
): 'left' | 'right' | null {
  const dockPocket = getDockCornerPocketMetrics(vw, vh);
  const cornerZoneW = isDockDrag
    ? dockPocket.zoneW
    : Math.min(185, Math.max(125, vw * 0.145));
  const cornerZoneTop = isDockDrag
    ? dockPocket.zoneTop
    : Math.max(vh * 0.78, vh - 140);
  const cornerExitW = isDockDrag
    ? dockPocket.exitW
    : Math.min(215, Math.max(150, vw * 0.175));
  const cornerExitTop = isDockDrag
    ? dockPocket.exitTop
    : Math.max(vh * 0.74, vh - 165);

  if (
    (clientX <= cornerZoneW && clientY >= cornerZoneTop) ||
    (prevSide === 'left' && clientX <= cornerExitW && clientY >= cornerExitTop)
  ) {
    return 'left';
  }
  if (
    (clientX >= vw - cornerZoneW && clientY >= cornerZoneTop) ||
    (prevSide === 'right' && clientX >= vw - cornerExitW && clientY >= cornerExitTop)
  ) {
    return 'right';
  }
  return null;
}

function clampSideDockTop(rawTop: number, estHeight = SIDE_DOCK_EST_H): number {
  if (typeof window === 'undefined') return 90;
  const { vh } = getLayoutViewport();
  const minTop = 16;
  const h = Math.min(estHeight, Math.max(240, vh - 32));
  const maxTop = Math.max(minTop, vh - h - 16);
  return Math.max(minTop, Math.min(maxTop, rawTop));
}

function loadInitialOrbPos(): OrbPos {
  if (typeof window === 'undefined') return { side: 'left' };
  const { vw: width } = getLayoutViewport();
  try {
    const raw = window.localStorage.getItem(ORB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        left?: number;
        top?: number;
        side?: string;
      };
      if (parsed.side === 'right' || parsed.side === 'left') {
        return { side: parsed.side };
      }
      if (typeof parsed.left === 'number' && Number.isFinite(parsed.left)) {
        const { orbSize } = getOrbCornerMargins(width);
        return { side: parsed.left + orbSize * 0.5 < width * 0.5 ? 'left' : 'right' };
      }
    }
  } catch {
    // Ignore storage access restrictions
  }
  return { side: 'left' };
}

function loadInitialDockPlacement(): DockPlacement {
  if (typeof window === 'undefined') return { mode: 'bottom' };
  try {
    const raw = window.localStorage.getItem(DOCK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: string };
      if (parsed.mode === 'left' || parsed.mode === 'right') {
        return { mode: parsed.mode };
      }
    }
  } catch {
    // Ignore storage access restrictions
  }
  return { mode: 'bottom' };
}

export const FloatingAnnotationPalette: React.FC = () => {
  const {
    activeTool,
    isPaletteOpen,
    penSettings,
    fountainSettings,
    pencilSettings,
    highlighterSettings,
    tapeSettings,
    laserSettings,
    eraserSettings,
    lassoSettings,
    systemSettings,
    selectedStrokeObjects,
    selectedStrokeAnchor,
    shortcutFeedback,
  } = useAnnotationToolState();
  const { canUndo, canRedo, hasActiveStrokes, isExportingPdf } = useAnnotationDockState();
  const {
    setActiveTool,
    setPaletteOpen,
    updatePenSettings,
    updateFountainSettings,
    updatePencilSettings,
    updateHighlighterSettings,
    updateTapeSettings,
    updateLaserSettings,
    updateEraserSettings,
    updateLassoSettings,
    updateSystemSettings,
    toggleOptionalTool,
    updateStrokesBatch,
    toggleTapeRevealed,
    removeStrokes,
    duplicateStrokes,
    reorderStrokes,
    exportActiveSurfacePdf,
    undo,
    redo,
    clearSurface,
    emitShortcutFeedback,
  } = useAnnotationActions();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isDockSettingsOpen, setIsDockSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSelectedPropsOpen, setIsSelectedPropsOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SizeSlotIndex | null>(null);
  const [editingColorSlot, setEditingColorSlot] = useState<ColorSlotIndex | null>(null);
  const [lastSizableTool, setLastSizableTool] = useState<SizableAnnotationTool>('pen');
  const [lastColorableTool, setLastColorableTool] = useState<ColorableAnnotationTool>('pen');
  const [isRollerPulsing, setIsRollerPulsing] = useState(false);
  const [dockPlacement, setDockPlacement] = useState<DockPlacement>(loadInitialDockPlacement);
  const [liveDragMode, setLiveDragMode] = useState<'bottom' | 'left' | 'right' | null>(null);
  const [hasDragMorphed, setHasDragMorphed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dropPreview, setDropPreview] = useState<DockDropTarget | null>(null);
  const [orbPos, setOrbPos] = useState<OrbPos>(loadInitialOrbPos);
  const [isOrbDragging, setIsOrbDragging] = useState(false);
  const [orbDragTarget, setOrbDragTarget] = useState<'bottom' | 'left' | 'right' | null>(null);
  const [orbDragMagnet, setOrbDragMagnet] = useState<'left' | 'right' | null>(null);
  const [viewportSize, setViewportSize] = useState<{ vw: number; vh: number }>(getLayoutViewport);

  const dockRootRef = useRef<HTMLDivElement>(null);
  const dockMorphShellRef = useRef<HTMLDivElement>(null);
  const dockMorphGhostHostRef = useRef<HTMLDivElement>(null);
  const dockContentRef = useRef<HTMLDivElement>(null);
  const orbBtnRef = useRef<HTMLButtonElement>(null);
  const selectedBarRef = useRef<HTMLDivElement>(null);
  const dockX = useMotionValue(0);
  const dockY = useMotionValue(0);
  const dockMorphShiftX = useMotionValue(0);
  const dockMorphShiftY = useMotionValue(0);
  const dockMorphScaleX = useMotionValue(1);
  const dockMorphScaleY = useMotionValue(1);
  const dockMorphRotate = useMotionValue(0);
  const dockMorphW = useMotionValue(690);
  const dockMorphH = useMotionValue(68);
  const dockMorphRadius = useMotionValue(34);
  const dockContentOpacity = useMotionValue(1);
  const dockContentScale = useMotionValue(1);
  const dockScale = useMotionValue(1);
  const dockClipPath = useMotionValue<string>('none');
  const dockOrbCoreOpacity = useMotionValue(0);
  const dockOrbShellX = useMotionValue(0);
  const dockOrbShellY = useMotionValue(0);
  const orbX = useMotionValue(0);
  const orbY = useMotionValue(0);
  const orbLauncherOpacity = useMotionValue(1);
  const dockAnimXRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockAnimYRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphShiftAnimXRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphShiftAnimYRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphScaleAnimXRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphScaleAnimYRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphRotateAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphWAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphHAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockMorphRadiusAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockContentOpacityAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockContentScaleAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockGhostFadeAnimRef = useRef<Animation | null>(null);
  const dockAnimScaleRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockClipAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockOrbCoreAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const orbLauncherOpacityAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const dockAnimTargetRef = useRef<{ x: number; y: number } | null>(null);
  const isAnimatingDockRef = useRef(false);
  const isAspectMorphingRef = useRef(false);
  const orbAnimXRef = useRef<ReturnType<typeof animate> | null>(null);
  const orbAnimYRef = useRef<ReturnType<typeof animate> | null>(null);
  const wasDragOrbFormedRef = useRef(false);
  const orbDragMagnetRef = useRef<'left' | 'right' | null>(null);
  const dockPendingSpringRef = useRef(false);
  const dockPendingMorphRef = useRef(false);
  const dockPendingMorphDirectionRef = useRef<'to-side' | 'to-bottom' | null>(null);
  const dockPendingMorphSideRef = useRef<'left' | 'right' | null>(null);
  const dockPendingMorphSourceRef = useRef<'drag' | 'preset'>('drag');
  const dockPendingVelocityRef = useRef<{ vx: number; vy: number } | null>(null);
  const dockPendingMorphFromCenterRef = useRef<{ cx: number; cy: number } | null>(null);
  const pendingAspectMorphRef = useRef<{
    fromW: number;
    fromH: number;
    fromRadius: number;
    ghostEl: HTMLElement | null;
  } | null>(null);
  const dockOpeningFromOrbRef = useRef<{ cx: number; cy: number } | null>(null);
  const dockWasCollapsedIntoOrbRef = useRef(false);
  const dockCollapsedFromDragRef = useRef(false);
  const dockCollapseDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dockCollapseFlightSecRef = useRef<number>(0.18);
  const dockAspectMorphTimerRef = useRef<number | null>(null);
  const pendingDragMorphRef = useRef<{
    clientX: number;
    clientY: number;
    fromMode: 'bottom' | 'left' | 'right';
    targetMode: 'bottom' | 'left' | 'right';
    oldCx: number;
    oldCy: number;
  } | null>(null);
  const orbPendingSpringRef = useRef(false);
  const orbPendingVelocityRef = useRef<{ vx: number; vy: number } | null>(null);
  const orbPendingFlightRef = useRef<{
    startLeft: number;
    startTop: number;
    vx: number;
    vy: number;
  } | null>(null);
  const dockLayoutReadyRef = useRef(false);
  const orbLayoutReadyRef = useRef(false);
  const dockPlacementRef = useRef(dockPlacement);
  dockPlacementRef.current = dockPlacement;
  const dockMoveRafRef = useRef<number | null>(null);
  const dockLatestPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const orbMoveRafRef = useRef<number | null>(null);
  const orbLatestPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const horizDimsRef = useRef<{ w: number; h: number }>({ w: 690, h: 68 });
  const sideDimsRef = useRef<{ w: number; h: number }>({ w: 64, h: 440 });
  const nibsViewportRef = useRef<HTMLDivElement>(null);
  const nibsTrayRef = useRef<HTMLDivElement>(null);
  const [nibsScrollEdge, setNibsScrollEdge] = useState<{ canStart: boolean; canEnd: boolean }>({
    canStart: false,
    canEnd: false,
  });
  const [isTrayDragging, setIsTrayDragging] = useState(false);
  const trayDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollPos: number;
    startTime: number;
    lastPos: number;
    lastTime: number;
    velocity: number;
    isSide: boolean;
    active: boolean;
  } | null>(null);
  const trayMomentumRafRef = useRef<number | null>(null);
  const lastDropPreviewRef = useRef<DockDropTarget | null>(null);
  const suppressNextClickRef = useRef(false);
  const selectedSliderDraggingRef = useRef(false);
  const selectedSliderDirtyRef = useRef(false);
  const pulseTimerRef = useRef<number | null>(null);
  const pendingDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startTime: number;
  } | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    liveLeft: number;
    liveTop: number;
    initialMode: 'bottom' | 'left' | 'right';
    currentMode: 'bottom' | 'left' | 'right';
    hasMorphed: boolean;
    modeEnteredAt: number;
    modeAnchorX: number;
    modeAnchorY: number;
    lastClientX: number;
    lastClientY: number;
    lastTime: number;
    vx: number;
    vy: number;
    orbMagnetBlend: number;
    sideMagnetBlend: number;
    bottomMagnetBlend: number;
    lastSideTarget?: { side: 'left' | 'right'; wallLeft: number; topPx: number };
    lastBottomTarget?: { restLeft: number; restTop: number };
    morphedLocalCx?: number;
    morphedLocalCy?: number;
    lastOrbCoords?: { left: number; top: number; localCx: number; localCy: number };
  } | null>(null);
  const orbDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
    lastClientX: number;
    lastClientY: number;
    lastTime: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);

  const hasInspectorOptions = activeTool !== 'cursor';

  const triggerRollerPulse = useCallback(() => {
    setIsRollerPulsing(true);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setIsRollerPulsing(false);
      pulseTimerRef.current = null;
    }, 360);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  // Remember the most recently active sizable & colorable tools so the 3 external slots adapt cleanly
  // and wake that tool automatically if clicked from Browse mode.
  useEffect(() => {
    if (activeTool !== 'cursor' && activeTool !== 'lasso' && activeTool !== 'laser') {
      setLastSizableTool(activeTool);
    }
    if (activeTool !== 'cursor' && activeTool !== 'lasso' && activeTool !== 'eraser') {
      setLastColorableTool(activeTool);
    }
    setEditingSlot(null);
    setEditingColorSlot(null);
  }, [activeTool]);

  // Close popovers when switching to cursor/eraser or collapsing dock
  useEffect(() => {
    if (!hasInspectorOptions || !isPaletteOpen) {
      setIsInspectorOpen(false);
    }
    if (!isPaletteOpen) {
      setIsDockSettingsOpen(false);
      setIsShortcutsOpen(false);
      setEditingSlot(null);
      setEditingColorSlot(null);
    }
  }, [hasInspectorOptions, isPaletteOpen]);

  // Close properties popover whenever selection disappears or changes
  useEffect(() => {
    selectedSliderDraggingRef.current = false;
    selectedSliderDirtyRef.current = false;
    if (!selectedStrokeAnchor) {
      setIsSelectedPropsOpen(false);
    }
  }, [selectedStrokeAnchor]);

  // Close popovers on outside pointerdown (capture phase so drawing surfaces calling stopPropagation still dismiss it) or Escape key
  useEffect(() => {
    if (
      !isInspectorOpen &&
      !isDockSettingsOpen &&
      !isShortcutsOpen &&
      !isSelectedPropsOpen &&
      editingSlot === null &&
      editingColorSlot === null
    ) {
      return;
    }
    const onOutside = (e: PointerEvent) => {
      const dockEl = dockRootRef.current;
      const barEl = selectedBarRef.current;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const inNode = (el: HTMLElement | null) =>
        Boolean(
          el &&
            (path.length > 0
              ? path.includes(el)
              : e.target instanceof Node && el.contains(e.target))
        );
      if (!inNode(dockEl)) {
        setIsInspectorOpen(false);
        setIsDockSettingsOpen(false);
        setIsShortcutsOpen(false);
        setEditingSlot(null);
        setEditingColorSlot(null);
      }
      if (!inNode(barEl)) {
        setIsSelectedPropsOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsInspectorOpen(false);
        setIsDockSettingsOpen(false);
        setIsShortcutsOpen(false);
        setIsSelectedPropsOpen(false);
        setEditingSlot(null);
        setEditingColorSlot(null);
      }
    };
    window.addEventListener('pointerdown', onOutside, { capture: true });
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onOutside, { capture: true });
      window.removeEventListener('keydown', onEsc, { capture: true });
    };
  }, [
    isInspectorOpen,
    isDockSettingsOpen,
    isShortcutsOpen,
    isSelectedPropsOpen,
    editingSlot,
    editingColorSlot,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(orbPos));
    } catch {
      // Ignore storage write restrictions
    }
  }, [orbPos]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockPlacement));
    } catch {
      // Ignore storage write restrictions
    }
  }, [dockPlacement]);

  const orbPosRef = useRef(orbPos);
  orbPosRef.current = orbPos;

  const clearMorphGhostHost = useCallback(() => {
    try {
      dockGhostFadeAnimRef.current?.cancel();
    } catch {
      // Ignore cancel errors
    }
    dockGhostFadeAnimRef.current = null;
    dockMorphGhostHostRef.current?.replaceChildren();
  }, []);

  const stopDockShiftOnly = useCallback(() => {
    dockMorphShiftAnimXRef.current?.stop();
    dockMorphShiftAnimXRef.current = null;
    dockMorphShiftAnimYRef.current?.stop();
    dockMorphShiftAnimYRef.current = null;
    dockMorphScaleAnimXRef.current?.stop();
    dockMorphScaleAnimXRef.current = null;
    dockMorphScaleAnimYRef.current?.stop();
    dockMorphScaleAnimYRef.current = null;
    dockMorphRotateAnimRef.current?.stop();
    dockMorphRotateAnimRef.current = null;
  }, []);

  const stopDockContainerMorph = useCallback(() => {
    dockMorphWAnimRef.current?.stop();
    dockMorphWAnimRef.current = null;
    dockMorphHAnimRef.current?.stop();
    dockMorphHAnimRef.current = null;
    dockMorphRadiusAnimRef.current?.stop();
    dockMorphRadiusAnimRef.current = null;
    dockContentOpacityAnimRef.current?.stop();
    dockContentOpacityAnimRef.current = null;
    dockContentScaleAnimRef.current?.stop();
    dockContentScaleAnimRef.current = null;
    if (dockAspectMorphTimerRef.current !== null) {
      window.clearTimeout(dockAspectMorphTimerRef.current);
      dockAspectMorphTimerRef.current = null;
    }
    clearMorphGhostHost();
    isAspectMorphingRef.current = false;
    dockContentOpacity.set(1);
    dockContentScale.set(1);
    const rootEl = dockRootRef.current;
    if (rootEl) {
      rootEl.classList.remove('is-aspect-morphing');
      if (!isAnimatingDockRef.current) {
        rootEl.classList.remove('is-dock-animating');
      }
    }
  }, [clearMorphGhostHost, dockContentOpacity, dockContentScale]);

  const stopDockMorphShift = useCallback(() => {
    stopDockShiftOnly();
    stopDockContainerMorph();
  }, [stopDockContainerMorph, stopDockShiftOnly]);

  const captureAspectMorphStart = useCallback(
    (
      fromMode: DockPlacement['mode'],
      vw: number,
      dimsFallback: { w: number; h: number }
    ): { fromW: number; fromH: number; fromRadius: number; ghostEl: HTMLElement | null } => {
      const contentEl = dockContentRef.current;
      const fromW = isAspectMorphingRef.current
        ? Math.max(48, dockMorphW.get())
        : contentEl?.offsetWidth || dimsFallback.w;
      const fromH = isAspectMorphingRef.current
        ? Math.max(48, dockMorphH.get())
        : contentEl?.offsetHeight || dimsFallback.h;
      const fromRadius = isAspectMorphingRef.current
        ? dockMorphRadius.get()
        : fromMode === 'bottom' && vw <= 840
        ? 24
        : Math.min(34, fromW * 0.5, fromH * 0.5);
      const ghostEl = createMorphGhostClone(contentEl, fromW, fromH);
      return { fromW, fromH, fromRadius, ghostEl };
    },
    [dockMorphH, dockMorphRadius, dockMorphW]
  );

  const startContainerAspectMorph = useCallback(
    (
      targetMode: DockPlacement['mode'],
      toW: number,
      toH: number,
      vw: number,
      captured: {
        fromW: number;
        fromH: number;
        fromRadius: number;
        ghostEl: HTMLElement | null;
      } | null
    ) => {
      const rootEl = dockRootRef.current;
      if (!rootEl || !captured || toW <= 0 || toH <= 0) {
        stopDockContainerMorph();
        return;
      }
      if (prefersReducedMotionNow()) {
        stopDockContainerMorph();
        return;
      }

      const toRadius =
        targetMode === 'bottom' && vw <= 840 ? 24 : Math.min(34, toW * 0.5, toH * 0.5);

      // Preserve active velocities when reversing direction mid-morph (C1 physics continuity)
      const prevVxW = isAspectMorphingRef.current ? dockMorphW.getVelocity() : 0;
      const prevVxH = isAspectMorphingRef.current ? dockMorphH.getVelocity() : 0;
      const prevVxR = isAspectMorphingRef.current ? dockMorphRadius.getVelocity() : 0;

      dockMorphWAnimRef.current?.stop();
      dockMorphHAnimRef.current?.stop();
      dockMorphRadiusAnimRef.current?.stop();
      dockContentOpacityAnimRef.current?.stop();
      dockContentScaleAnimRef.current?.stop();
      if (dockAspectMorphTimerRef.current !== null) {
        window.clearTimeout(dockAspectMorphTimerRef.current);
        dockAspectMorphTimerRef.current = null;
      }
      clearMorphGhostHost();

      rootEl.style.setProperty('--morph-to-w', `${toW}px`);
      rootEl.style.setProperty('--morph-to-h', `${toH}px`);
      isAspectMorphingRef.current = true;
      rootEl.classList.add('is-aspect-morphing', 'is-dock-animating');

      dockMorphW.set(captured.fromW);
      dockMorphH.set(captured.fromH);
      dockMorphRadius.set(captured.fromRadius);
      dockMorphScaleX.set(1);
      dockMorphScaleY.set(1);
      dockMorphRotate.set(0);

      // Mount outgoing snapshot ghost centered inside the morph shell and fade out via compositor WAAPI
      if (captured.ghostEl && dockMorphGhostHostRef.current) {
        dockMorphGhostHostRef.current.appendChild(captured.ghostEl);
        if (typeof captured.ghostEl.animate === 'function') {
          const ghostAnim = captured.ghostEl.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(0.91)' },
            ],
            {
              duration: 90,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'forwards',
            }
          );
          dockGhostFadeAnimRef.current = ghostAnim;
          void ghostAnim.finished
            .then(() => {
              if (dockGhostFadeAnimRef.current === ghostAnim) {
                clearMorphGhostHost();
              }
            })
            .catch(() => {
              // Ignore aborted animations
            });
        }
      }

      // Bloom in new content inside the reshaping glass pill
      dockContentOpacity.set(0);
      dockContentScale.set(0.92);
      const opAnim = animate(dockContentOpacity, 1, {
        duration: 0.145,
        delay: 0.038,
        ease: APPLE_CALM_EASE,
      });
      const scAnim = animate(dockContentScale, 1, {
        duration: 0.18,
        delay: 0.025,
        ease: APPLE_CALM_EASE,
      });
      dockContentOpacityAnimRef.current = opAnim;
      dockContentScaleAnimRef.current = scAnim;

      const animW = animate(dockMorphW, toW, {
        ...APPLE_CONTAINER_SPRING,
        velocity: prevVxW,
      });
      const animH = animate(dockMorphH, toH, {
        ...APPLE_CONTAINER_SPRING,
        velocity: prevVxH,
      });
      const animR = animate(dockMorphRadius, toRadius, {
        ...APPLE_CONTAINER_SPRING,
        velocity: prevVxR,
      });
      dockMorphWAnimRef.current = animW;
      dockMorphHAnimRef.current = animH;
      dockMorphRadiusAnimRef.current = animR;

      const finalizeMorph = () => {
        if (dockMorphWAnimRef.current !== animW || dockMorphHAnimRef.current !== animH) {
          return;
        }
        dockMorphWAnimRef.current = null;
        dockMorphHAnimRef.current = null;
        dockMorphRadiusAnimRef.current = null;
        dockContentOpacityAnimRef.current = null;
        dockContentScaleAnimRef.current = null;
        if (dockAspectMorphTimerRef.current !== null) {
          window.clearTimeout(dockAspectMorphTimerRef.current);
          dockAspectMorphTimerRef.current = null;
        }
        clearMorphGhostHost();
        isAspectMorphingRef.current = false;
        dockContentOpacity.set(1);
        dockContentScale.set(1);
        const curRoot = dockRootRef.current;
        if (curRoot) {
          curRoot.classList.remove('is-aspect-morphing');
          if (!isAnimatingDockRef.current) {
            curRoot.classList.remove('is-dock-animating');
          }
        }
      };

      void Promise.all([animW.finished, animH.finished]).then(finalizeMorph);
      // Safety net in case spring settlement is interrupted cleanly
      dockAspectMorphTimerRef.current = window.setTimeout(finalizeMorph, 520);
    },
    [
      clearMorphGhostHost,
      dockContentOpacity,
      dockContentScale,
      dockMorphH,
      dockMorphRadius,
      dockMorphRotate,
      dockMorphScaleX,
      dockMorphScaleY,
      dockMorphW,
      stopDockContainerMorph,
    ]
  );

  const stopDockPositionMotion = useCallback((preserveScale = false) => {
    dockAnimXRef.current?.stop();
    dockAnimXRef.current = null;
    dockAnimYRef.current?.stop();
    dockAnimYRef.current = null;
    if (!preserveScale) {
      dockAnimScaleRef.current?.stop();
      dockAnimScaleRef.current = null;
    }
    isAnimatingDockRef.current = false;
    if (!isAspectMorphingRef.current) {
      dockRootRef.current?.classList.remove('is-dock-animating');
    }
  }, []);

  const stopDockMorphMotion = useCallback(() => {
    dockClipAnimRef.current?.stop();
    dockClipAnimRef.current = null;
    dockOrbCoreAnimRef.current?.stop();
    dockOrbCoreAnimRef.current = null;
  }, []);

  const stopDockMotion = useCallback(
    (preserveScale = false) => {
      stopDockPositionMotion(preserveScale);
      stopDockMorphMotion();
      stopDockMorphShift();
    },
    [stopDockMorphMotion, stopDockMorphShift, stopDockPositionMotion]
  );

  const stopOrbMotion = useCallback(() => {
    orbAnimXRef.current?.stop();
    orbAnimXRef.current = null;
    orbAnimYRef.current?.stop();
    orbAnimYRef.current = null;
  }, []);

  // Keep orb position & dock opening synchronized when reopening or collapsing via shortcut/button
  const prevPaletteOpenForReopenRef = useRef(isPaletteOpen);
  useLayoutEffect(() => {
    const wasOpen = prevPaletteOpenForReopenRef.current;
    prevPaletteOpenForReopenRef.current = isPaletteOpen;
    if (!wasOpen && isPaletteOpen) {
      dockWasCollapsedIntoOrbRef.current = false;
      dockCollapsedFromDragRef.current = false;
      dockCollapseDeltaRef.current = { dx: 0, dy: 0 };
      if (!dockOpeningFromOrbRef.current) {
        const { vw, vh } = getLayoutViewport();
        const halfOrb = getOrbCornerMargins(vw).orbSize * 0.5;
        const resolved = resolveOrbCoords(orbPosRef.current, vw, vh);
        const cx = (orbX.get() || resolved.left) + halfOrb;
        const cy = (orbY.get() || resolved.top) + halfOrb;
        dockOpeningFromOrbRef.current = { cx, cy };
      }
    } else if (wasOpen && !isPaletteOpen) {
      if (!dockWasCollapsedIntoOrbRef.current && typeof window !== 'undefined') {
        stopDockPositionMotion();
        stopDockMorphShift();
        dockMorphShiftX.set(0);
        dockMorphShiftY.set(0);
        dockMorphScaleX.set(1);
        dockMorphScaleY.set(1);
        dockMorphRotate.set(0);
        dockScale.set(1);
        const { vw, vh } = getLayoutViewport();
        const mode = dockPlacementRef.current.mode;
        const { orbSize } = getOrbCornerMargins(vw);
        const dims =
          mode === 'bottom'
            ? {
                w: Math.min(horizDimsRef.current.w, Math.max(260, vw - 28)),
                h: Math.min(horizDimsRef.current.h, Math.max(54, vh - 32)),
              }
            : {
                w: sideDimsRef.current.w || 64,
                h: Math.min(sideDimsRef.current.h || SIDE_DOCK_EST_H, Math.max(240, vh - 32)),
              };
        const cx = dockX.get() + dims.w * 0.5;
        const cy = dockY.get() + dims.h * 0.5;
        const targetSide: 'left' | 'right' =
          mode === 'left' ? 'left' : mode === 'right' ? 'right' : orbPosRef.current.side;
        const cornerCoords = resolveOrbCoords({ side: targetSide }, vw, vh);
        const cornerCx = cornerCoords.left + orbSize * 0.5;
        const cornerCy = cornerCoords.top + orbSize * 0.5;
        const dx = cornerCx - cx;
        const dy = cornerCy - cy;
        const flightDist = Math.hypot(dx, dy);
        dockCollapseDeltaRef.current = { dx, dy };
        dockCollapseFlightSecRef.current = Math.min(0.25, Math.max(0.2, 0.18 + flightDist * 0.00016));
        dockCollapsedFromDragRef.current = false;
        dockWasCollapsedIntoOrbRef.current = true;
        orbPendingFlightRef.current = null;
        orbPendingSpringRef.current = false;
        orbPendingVelocityRef.current = null;
        const padX = Math.max(0, (dims.w - orbSize) * 0.5);
        const padY = Math.max(0, (dims.h - orbSize) * 0.5);
        dockOrbShellX.set(padX);
        dockOrbShellY.set(padY);
        const targetInset = `inset(${padY.toFixed(1)}px ${padX.toFixed(1)}px ${padY.toFixed(1)}px ${padX.toFixed(1)}px round 999px)`;
        dockRootRef.current?.classList.add('is-morphing-orb');
        if (dockClipPath.get() === 'none') {
          dockClipPath.set('inset(-28.0px -28.0px -28.0px -28.0px round 999px)');
        }
        dockClipAnimRef.current?.stop();
        dockClipAnimRef.current = animate(dockClipPath, targetInset, {
          duration: 0.13,
          ease: APPLE_CALM_EASE,
        });
        dockOrbCoreAnimRef.current?.stop();
        const coreAnim = animate(dockOrbCoreOpacity, 1, {
          duration: 0.08,
          delay: 0.04,
          ease: 'easeOut',
        });
        dockOrbCoreAnimRef.current = coreAnim;
        void coreAnim.finished.then(() => {
          if (dockOrbCoreAnimRef.current === coreAnim) {
            dockOrbCoreAnimRef.current = null;
          }
        });
        orbAnimXRef.current?.stop();
        orbAnimXRef.current = null;
        orbAnimYRef.current?.stop();
        orbAnimYRef.current = null;
        orbX.set(cornerCoords.left);
        orbY.set(cornerCoords.top);
        setOrbPos({ side: targetSide });
      }
    }
  }, [dockClipPath, dockMorphRotate, dockMorphScaleX, dockMorphScaleY, dockMorphShiftX, dockMorphShiftY, dockOrbCoreOpacity, dockOrbShellX, dockOrbShellY, dockScale, isPaletteOpen, dockX, dockY, orbX, orbY, stopDockMorphShift, stopDockPositionMotion]);

  // Synchronize corner orb visibility cleanly on the same RAF clock as exit flight
  useLayoutEffect(() => {
    orbLauncherOpacityAnimRef.current?.stop();
    orbLauncherOpacityAnimRef.current = null;

    if (isPaletteOpen) {
      orbLauncherOpacity.set(1);
      return;
    }

    if (dockWasCollapsedIntoOrbRef.current) {
      const flightSec = dockCollapseFlightSecRef.current || (dockCollapsedFromDragRef.current ? 0.18 : 0.21);
      const delaySec = Math.max(0.14, flightSec - 0.012);
      dockCollapsedFromDragRef.current = false;
      orbLauncherOpacity.set(0);
      const anim = animate(orbLauncherOpacity, 1, {
        duration: 0.025,
        delay: delaySec,
        ease: 'linear',
      });
      orbLauncherOpacityAnimRef.current = anim;
      void anim.finished.then(() => {
        if (orbLauncherOpacityAnimRef.current === anim) {
          orbLauncherOpacityAnimRef.current = null;
          dockWasCollapsedIntoOrbRef.current = false;
          orbLauncherOpacity.set(1);
        }
      });
    } else {
      dockCollapsedFromDragRef.current = false;
      orbLauncherOpacity.set(1);
    }

    return () => {
      orbLauncherOpacityAnimRef.current?.stop();
      orbLauncherOpacityAnimRef.current = null;
    };
  }, [isPaletteOpen, orbLauncherOpacity]);

  const openPaletteFromOrb = useCallback(() => {
    dockWasCollapsedIntoOrbRef.current = false;
    dockCollapsedFromDragRef.current = false;
    dockCollapseDeltaRef.current = { dx: 0, dy: 0 };
    const { vw, vh } = getLayoutViewport();
    const halfOrb = getOrbCornerMargins(vw).orbSize * 0.5;
    const resolved = resolveOrbCoords(orbPosRef.current, vw, vh);
    const cx = (orbX.get() || resolved.left) + halfOrb;
    const cy = (orbY.get() || resolved.top) + halfOrb;
    dockOpeningFromOrbRef.current = { cx, cy };
    setPaletteOpen(true);
  }, [orbX, orbY, setPaletteOpen]);

  const effectiveDockMode: DockPlacement['mode'] = liveDragMode ?? dockPlacement.mode;

  const morphDockToOrbVisual = useCallback(
    (
      dims: { w: number; h: number },
      duration: number,
      vw: number,
      localCx?: number,
      localCy?: number
    ) => {
      const { orbSize } = getOrbCornerMargins(vw);
      const cx = Math.max(
        orbSize * 0.5,
        Math.min(Math.max(orbSize * 0.5, dims.w - orbSize * 0.5), localCx ?? dims.w * 0.5)
      );
      const cy = Math.max(
        orbSize * 0.5,
        Math.min(Math.max(orbSize * 0.5, dims.h - orbSize * 0.5), localCy ?? dims.h * 0.5)
      );
      dockOrbShellX.set(cx - orbSize * 0.5);
      dockOrbShellY.set(cy - orbSize * 0.5);
      const padLeft = Math.max(0, cx - orbSize * 0.5);
      const padRight = Math.max(0, dims.w - cx - orbSize * 0.5);
      const padTop = Math.max(0, cy - orbSize * 0.5);
      const padBottom = Math.max(0, dims.h - cy - orbSize * 0.5);
      const targetInset = `inset(${padTop.toFixed(1)}px ${padRight.toFixed(1)}px ${padBottom.toFixed(1)}px ${padLeft.toFixed(1)}px round 999px)`;
      dockRootRef.current?.classList.add('is-morphing-orb');
      if (dockClipPath.get() === 'none') {
        dockClipPath.set('inset(-28.0px -28.0px -28.0px -28.0px round 999px)');
      }
      dockClipAnimRef.current?.stop();
      dockClipAnimRef.current = animate(dockClipPath, targetInset, {
        duration,
        ease: APPLE_CALM_EASE,
      });
      dockOrbCoreAnimRef.current?.stop();
      const coreAnim = animate(dockOrbCoreOpacity, 1, {
        duration: Math.max(0.09, duration * 0.65),
        delay: Math.min(0.05, duration * 0.28),
        ease: APPLE_CALM_EASE,
      });
      dockOrbCoreAnimRef.current = coreAnim;
      void coreAnim.finished.then(() => {
        if (dockOrbCoreAnimRef.current === coreAnim) {
          dockOrbCoreAnimRef.current = null;
        }
      });
    },
    [dockClipPath, dockOrbCoreOpacity, dockOrbShellX, dockOrbShellY]
  );

  const collapseDockIntoCornerOrb = useCallback(
    (opts: {
      targetSide: 'left' | 'right';
      dims: { w: number; h: number };
      orbCxOnDock: number;
      orbCyOnDock: number;
      vw: number;
      vh: number;
      fromDrag: boolean;
      skipVisualMorph?: boolean;
      localCx?: number;
      localCy?: number;
    }) => {
      const {
        targetSide,
        dims,
        orbCxOnDock,
        orbCyOnDock,
        vw,
        vh,
        fromDrag,
        skipVisualMorph = false,
        localCx,
        localCy,
      } = opts;
      const { orbSize } = getOrbCornerMargins(vw);
      const cornerCoords = resolveOrbCoords({ side: targetSide }, vw, vh);
      const cornerCx = cornerCoords.left + orbSize * 0.5;
      const cornerCy = cornerCoords.top + orbSize * 0.5;
      const dx = cornerCx - orbCxOnDock;
      const dy = cornerCy - orbCyOnDock;
      const flightDist = Math.hypot(dx, dy);
      const flightSec = fromDrag
        ? Math.min(0.24, Math.max(0.165, 0.155 + flightDist * 0.00018))
        : Math.min(0.26, Math.max(0.2, 0.18 + flightDist * 0.00016));

      stopDockPositionMotion(!fromDrag);
      stopDockMorphShift();
      dockMorphShiftX.set(0);
      dockMorphShiftY.set(0);
      if (Math.abs(dockMorphScaleX.get() - 1) > 0.002) {
        dockMorphScaleAnimXRef.current = animate(dockMorphScaleX, 1, { duration: 0.09, ease: APPLE_CALM_EASE });
      } else {
        dockMorphScaleX.set(1);
      }
      if (Math.abs(dockMorphScaleY.get() - 1) > 0.002) {
        dockMorphScaleAnimYRef.current = animate(dockMorphScaleY, 1, { duration: 0.09, ease: APPLE_CALM_EASE });
      } else {
        dockMorphScaleY.set(1);
      }
      if (Math.abs(dockMorphRotate.get()) > 0.05) {
        dockMorphRotateAnimRef.current = animate(dockMorphRotate, 0, { duration: 0.09, ease: APPLE_CALM_EASE });
      } else {
        dockMorphRotate.set(0);
      }
      dockAnimScaleRef.current?.stop();
      dockAnimScaleRef.current = null;
      if (Math.abs(dockScale.get() - 1) > 0.002) {
        dockAnimScaleRef.current = animate(dockScale, 1, { duration: 0.1, ease: APPLE_CALM_EASE });
      } else {
        dockScale.set(1);
      }

      if (!skipVisualMorph) {
        morphDockToOrbVisual(dims, fromDrag ? 0.175 : 0.185, vw, localCx, localCy);
      }
      orbPendingFlightRef.current = null;
      orbPendingSpringRef.current = false;
      orbPendingVelocityRef.current = null;
      dockCollapseDeltaRef.current = { dx, dy };
      dockCollapseFlightSecRef.current = flightSec;
      dockCollapsedFromDragRef.current = fromDrag;
      dockWasCollapsedIntoOrbRef.current = true;
      setIsInspectorOpen(false);
      setIsDockSettingsOpen(false);
      setIsShortcutsOpen(false);
      setEditingSlot(null);
      setEditingColorSlot(null);
      stopOrbMotion();
      orbX.set(cornerCoords.left);
      orbY.set(cornerCoords.top);
      setOrbPos({ side: targetSide });
      setPaletteOpen(false);
    },
    [
      dockMorphRotate,
      dockMorphScaleX,
      dockMorphScaleY,
      dockMorphShiftX,
      dockMorphShiftY,
      dockScale,
      morphDockToOrbVisual,
      orbX,
      orbY,
      setPaletteOpen,
      stopDockMorphShift,
      stopDockPositionMotion,
      stopOrbMotion,
    ]
  );

  const unmorphDockFromOrbVisual = useCallback(() => {
    dockRootRef.current?.classList.remove('is-morphing-orb');
    dockClipAnimRef.current?.stop();
    if (dockClipPath.get() !== 'none') {
      const anim = animate(
        dockClipPath,
        'inset(-28.0px -28.0px -28.0px -28.0px round 999px)',
        { duration: 0.16, ease: APPLE_CALM_EASE }
      );
      dockClipAnimRef.current = anim;
      void anim.finished.then(() => {
        if (dockClipAnimRef.current === anim) {
          dockClipAnimRef.current = null;
          dockClipPath.set('none');
        }
      });
    }
    dockOrbCoreAnimRef.current?.stop();
    const coreAnim = animate(dockOrbCoreOpacity, 0, {
      duration: 0.09,
      ease: 'easeOut',
    });
    dockOrbCoreAnimRef.current = coreAnim;
    void coreAnim.finished.then(() => {
      if (dockOrbCoreAnimRef.current === coreAnim) {
        dockOrbCoreAnimRef.current = null;
        dockOrbCoreOpacity.set(0);
      }
    });
  }, [dockClipPath, dockOrbCoreOpacity]);

  const animateDockTo = useCallback(
    (
      x: number,
      y: number,
      immediate: boolean,
      morphPulse = false,
      velocity?: { vx: number; vy: number } | null
    ) => {
      if (
        !immediate &&
        isAnimatingDockRef.current &&
        dockAnimTargetRef.current &&
        Math.abs(dockAnimTargetRef.current.x - x) < 1.5 &&
        Math.abs(dockAnimTargetRef.current.y - y) < 1.5
      ) {
        return;
      }
      stopDockPositionMotion(!immediate && !morphPulse);
      dockAnimTargetRef.current = { x, y };
      if (immediate) {
        stopDockMorphShift();
        dockMorphShiftX.set(0);
        dockMorphShiftY.set(0);
        dockX.set(x);
        dockY.set(y);
        dockScale.set(1);
        isAnimatingDockRef.current = false;
        if (!isAspectMorphingRef.current) {
          dockRootRef.current?.classList.remove('is-dock-animating');
        }
      } else {
        isAnimatingDockRef.current = true;
        dockRootRef.current?.classList.add('is-dock-animating');
        const curX = dockX.get();
        const curY = dockY.get();
        const dx = x - curX;
        const dy = y - curY;
        const maxSafeVx = Math.max(0, Math.abs(dx) - 6) * 4.5;
        const maxSafeVy = Math.max(0, Math.abs(dy) - 6) * 4.5;
        const safeVx =
          velocity && dx * velocity.vx > 0 && Math.abs(dx) > 10
            ? Math.sign(velocity.vx) * Math.min(Math.abs(velocity.vx) * 0.65, maxSafeVx)
            : 0;
        const safeVy =
          velocity && dy * velocity.vy > 0 && Math.abs(dy) > 10
            ? Math.sign(velocity.vy) * Math.min(Math.abs(velocity.vy) * 0.65, maxSafeVy)
            : 0;
        const ax = animate(dockX, x, {
          ...APPLE_SNAP_SPRING,
          velocity: safeVx,
        });
        const ay = animate(dockY, y, {
          ...APPLE_SNAP_SPRING,
          velocity: safeVy,
        });
        dockAnimXRef.current = ax;
        dockAnimYRef.current = ay;
        if (morphPulse && Math.abs(dockScale.get() - 1) > 0.002) {
          dockAnimScaleRef.current?.stop();
          dockAnimScaleRef.current = animate(dockScale, 1, APPLE_CONTAINER_SPRING);
        }
        void Promise.all([ax.finished, ay.finished]).then(() => {
          if (dockAnimXRef.current === ax && dockAnimYRef.current === ay) {
            isAnimatingDockRef.current = false;
            if (!isAspectMorphingRef.current) {
              dockRootRef.current?.classList.remove('is-dock-animating');
            }
          }
        });
      }
    },
    [dockMorphShiftX, dockMorphShiftY, dockScale, dockX, dockY, stopDockMorphShift, stopDockPositionMotion]
  );

  const animateOrbTo = useCallback(
    (x: number, y: number, immediate: boolean, velocity?: { vx: number; vy: number } | null) => {
      stopOrbMotion();
      if (immediate) {
        orbX.set(x);
        orbY.set(y);
      } else {
        const curX = orbX.get();
        const curY = orbY.get();
        const dx = x - curX;
        const dy = y - curY;
        const maxSafeVx = Math.max(0, Math.abs(dx) - 6) * 4.4;
        const maxSafeVy = Math.max(0, Math.abs(dy) - 6) * 4.4;
        const safeVx =
          velocity && dx * velocity.vx > 0 && Math.abs(dx) > 10
            ? Math.sign(velocity.vx) * Math.min(Math.abs(velocity.vx) * 0.55, maxSafeVx)
            : 0;
        const safeVy =
          velocity && dy * velocity.vy > 0 && Math.abs(dy) > 10
            ? Math.sign(velocity.vy) * Math.min(Math.abs(velocity.vy) * 0.55, maxSafeVy)
            : 0;
        const ax = animate(orbX, x, {
          ...APPLE_ORB_SPRING,
          velocity: safeVx,
        });
        const ay = animate(orbY, y, {
          ...APPLE_ORB_SPRING,
          velocity: safeVy,
        });
        orbAnimXRef.current = ax;
        orbAnimYRef.current = ay;
        void Promise.all([ax.finished, ay.finished]).then(() => {
          if (orbAnimXRef.current === ax && orbAnimYRef.current === ay) {
            orbAnimXRef.current = null;
            orbAnimYRef.current = null;
            orbX.set(x);
            orbY.set(y);
          }
        });
      }
    },
    [orbX, orbY, stopOrbMotion]
  );

  // Sync body drag state so reading iframes never swallow pointermove/pointerup mid-drag
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = isDragging || isOrbDragging;
    document.body.classList.toggle('is-palette-dragging', active);
    return () => {
      document.body.classList.remove('is-palette-dragging');
    };
  }, [isDragging, isOrbDragging]);

  useEffect(() => {
    return () => {
      stopDockMotion();
      stopOrbMotion();
      if (dockAspectMorphTimerRef.current !== null) {
        window.clearTimeout(dockAspectMorphTimerRef.current);
      }
      orbLauncherOpacityAnimRef.current?.stop();
      if (dockMoveRafRef.current !== null) {
        window.cancelAnimationFrame(dockMoveRafRef.current);
      }
      if (orbMoveRafRef.current !== null) {
        window.cancelAnimationFrame(orbMoveRafRef.current);
      }
      if (trayMomentumRafRef.current !== null) {
        window.cancelAnimationFrame(trayMomentumRafRef.current);
      }
    };
  }, [stopDockMotion, stopOrbMotion]);

  const getDimsForMode = useCallback((mode: DockPlacement['mode'], vw: number, vh: number) => {
    if (mode === 'bottom') {
      return {
        w: Math.min(horizDimsRef.current.w, Math.max(260, vw - 28)),
        h: Math.min(horizDimsRef.current.h, Math.max(54, vh - 32)),
      };
    }
    return {
      w: sideDimsRef.current.w || 64,
      h: Math.min(sideDimsRef.current.h || SIDE_DOCK_EST_H, Math.max(240, vh - 32)),
    };
  }, []);

  const getRestingDockCoords = useCallback(
    (placement: DockPlacement, dims: { w: number; h: number }, vw: number, vh: number) => {
      if (placement.mode === 'left') {
        return {
          left: SIDE_DOCK_MARGIN_X,
          top: clampSideDockTop((vh - dims.h) * 0.5, dims.h),
        };
      }
      if (placement.mode === 'right') {
        return {
          left: vw - SIDE_DOCK_MARGIN_X - dims.w,
          top: clampSideDockTop((vh - dims.h) * 0.5, dims.h),
        };
      }
      return {
        left: vw * 0.5 - dims.w * 0.5,
        top: vh - BOTTOM_DOCK_MARGIN - dims.h,
      };
    },
    []
  );

  const commitDropPreviewIfChanged = useCallback((nextTarget: DockDropTarget | null) => {
    if (isSameDropPreview(lastDropPreviewRef.current, nextTarget)) {
      return;
    }
    lastDropPreviewRef.current = nextTarget;
    setDropPreview(nextTarget);
  }, []);

  const computeDropTarget = useCallback(
    (
      mode: 'bottom' | 'left' | 'right',
      _rawLeft: number,
      _rawTop: number,
      _effW: number,
      _effH: number,
      clientX: number,
      clientY: number,
      startClientX: number,
      _startClientY: number,
      vx: number,
      vy: number,
      dyTotal: number,
      _allowSideOutwardCollapse = true,
      _hasMorphed = false,
      _modeElapsedMs = 999,
      totalDyFromDragStart = dyTotal,
      totalDxFromDragStart = clientX - startClientX,
      isRelease = false
    ): DockDropTarget | null => {
      if (typeof window === 'undefined') return null;
      const { vw, vh } = getLayoutViewport();
      const nx = clientX / Math.max(1, vw);
      const ny = clientY / Math.max(1, vh);
      const hDims = getDimsForMode('bottom', vw, vh);
      const prevPreview = lastDropPreviewRef.current;
      const wasOrbFormed = prevPreview?.kind === 'orb';
      const canSideDock = vw >= 640;
      const initialMode = dragStartRef.current?.initialMode ?? mode;
      const sweepSideContext: 'bottom' | 'left' | 'right' =
        mode === 'left' || mode === 'right'
          ? mode
          : _hasMorphed && _modeElapsedMs < 280
          ? initialMode
          : 'bottom';
      const dragDistFromStart = Math.hypot(totalDxFromDragStart, totalDyFromDragStart);
      const hasIntentionalDrag = dragDistFromStart >= 20 || wasOrbFormed;
      const cornerPocket = getDockCornerPocketMetrics(vw, vh);

      // When actively sweeping inward from a Side dock toward Bottom, do not let the corner pocket hijack the transition
      const sweepingInwardToBottom =
        !wasOrbFormed &&
        ((sweepSideContext === 'left' && vx > 0.055 && clientX > 52) ||
          (sweepSideContext === 'right' && vx < -0.055 && clientX < vw - 52));

      // 1. Magnetic Bottom-Left & Bottom-Right Corner Collapse (strictly scoped to the tight bottom corner pockets)
      const prevOrbSide = prevPreview?.kind === 'orb' ? prevPreview.side : null;
      const cornerMagnetSide =
        hasIntentionalDrag && !sweepingInwardToBottom
          ? detectCornerMagnet(clientX, clientY, vw, vh, prevOrbSide, true)
          : null;

      // Ballistic flick/throw detection on release: only triggers when truly thrown into a bottom corner
      let thrownCornerSide: 'left' | 'right' | null = null;
      if (isRelease && cornerMagnetSide === null && !sweepingInwardToBottom && dragDistFromStart >= 24) {
        const speed = Math.hypot(vx, vy);
        if (speed >= 0.48) {
          const throwMs = Math.min(230, 115 + speed * 80);
          const projX = Math.max(0, Math.min(vw, clientX + vx * throwMs));
          const projY = Math.max(0, Math.min(vh, clientY + vy * throwMs));
          thrownCornerSide = detectCornerMagnet(projX, projY, vw, vh, prevOrbSide, true);
          if (thrownCornerSide === null && vy >= 0.42 && Math.abs(vx) >= 0.24 && projY >= vh * 0.78) {
            if (vx < 0 && projX <= vw * 0.2) {
              thrownCornerSide = 'left';
            } else if (vx > 0 && projX >= vw * 0.8) {
              thrownCornerSide = 'right';
            }
          }
        }
      }

      // Never collapse in the upper/mid Left & Right side walls on desktop/tablet (those belong to Left & Right Side Docks).
      // Corner bezel collapse is strictly confined to the outer bottom corners.
      const pulledIntoLeftBezel = canSideDock
        ? !sweepingInwardToBottom &&
          ny >= 0.8 &&
          ((clientX <= 28 && (totalDxFromDragStart <= -14 || vx < -0.14)) ||
            (wasOrbFormed && clientX <= cornerPocket.exitW && ny >= 0.76))
        : (clientX <= 14 && totalDxFromDragStart <= -12) ||
          (clientX <= 28 && (totalDxFromDragStart <= -16 || vx < -0.14)) ||
          (wasOrbFormed && clientX <= 46 && vx <= 0.14);

      const pulledIntoRightBezel = canSideDock
        ? !sweepingInwardToBottom &&
          ny >= 0.8 &&
          ((clientX >= vw - 28 && (totalDxFromDragStart >= 14 || vx > 0.14)) ||
            (wasOrbFormed && clientX >= vw - cornerPocket.exitW && ny >= 0.76))
        : (clientX >= vw - 14 && totalDxFromDragStart >= 12) ||
          (clientX >= vw - 28 && (totalDxFromDragStart >= 16 || vx > 0.14)) ||
          (wasOrbFormed && clientX >= vw - 46 && vx >= -0.14);

      const inOuterCornerBand = canSideDock
        ? clientX <= cornerPocket.zoneW + 12 || clientX >= vw - cornerPocket.zoneW - 12
        : !(nx > 0.28 && nx < 0.72);

      const pulledIntoBottomCornerBezel =
        !sweepingInwardToBottom &&
        inOuterCornerBand &&
        ((clientY >= vh - 22 && totalDyFromDragStart >= 18) ||
          (wasOrbFormed && clientY >= vh - 48 && vy >= -0.15));

      if (
        cornerMagnetSide !== null ||
        thrownCornerSide !== null ||
        pulledIntoLeftBezel ||
        pulledIntoRightBezel ||
        pulledIntoBottomCornerBezel
      ) {
        const targetSide: 'left' | 'right' =
          cornerMagnetSide !== null
            ? cornerMagnetSide
            : thrownCornerSide !== null
            ? thrownCornerSide
            : pulledIntoLeftBezel
            ? 'left'
            : pulledIntoRightBezel
            ? 'right'
            : resolveMagneticOrbSide(clientX, vw, sweepSideContext);
        const cornerCoords = resolveOrbCoords({ side: targetSide }, vw, vh);
        return { kind: 'orb', left: cornerCoords.left, top: cornerCoords.top, side: targetSide };
      }

      // 2. Clean 3-Station Docking (Left Wall, Right Wall, Bottom Center) with Strict Hysteresis
      if (canSideDock) {
        const sideEnterX = Math.min(265, vw * 0.22);
        const sideExitLeftX = Math.max(vw * 0.28, sideEnterX + 52);
        const sideExitRightX = vw - sideExitLeftX;
        const bottomSafeLeftX = cornerPocket.zoneW + 36;
        const bottomSafeRightX = vw - bottomSafeLeftX;
        const modeDx = clientX - startClientX;

        if (mode === 'left') {
          if (clientX >= vw - sideEnterX && ny < 0.79) {
            const sideH = getDimsForMode('right', vw, vh).h;
            return { kind: 'side', side: 'right', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
          }
          if (clientX >= sideExitLeftX || (ny >= 0.79 && clientX > bottomSafeLeftX)) {
            return { kind: 'bottom-edge', x: 0, w: hDims.w, h: hDims.h };
          }
          const sideH = getDimsForMode('left', vw, vh).h;
          return { kind: 'side', side: 'left', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
        }

        if (mode === 'right') {
          if (clientX <= sideEnterX && ny < 0.79) {
            const sideH = getDimsForMode('left', vw, vh).h;
            return { kind: 'side', side: 'left', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
          }
          if (clientX <= sideExitRightX || (ny >= 0.79 && clientX < bottomSafeRightX)) {
            return { kind: 'bottom-edge', x: 0, w: hDims.w, h: hDims.h };
          }
          const sideH = getDimsForMode('right', vw, vh).h;
          return { kind: 'side', side: 'right', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
        }

        // From Bottom mode: smoothly transition to Left or Right side station across upper/mid wall
        if (ny < 0.79 && (dragDistFromStart >= 24 || _hasMorphed)) {
          if (
            clientX <= sideEnterX &&
            (modeDx <= -8 || Math.abs(totalDyFromDragStart) >= 24 || clientX <= Math.min(140, sideEnterX * 0.7))
          ) {
            const sideH = getDimsForMode('left', vw, vh).h;
            return { kind: 'side', side: 'left', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
          }
          if (
            clientX >= vw - sideEnterX &&
            (modeDx >= 8 || Math.abs(totalDyFromDragStart) >= 24 || clientX >= vw - Math.min(140, sideEnterX * 0.7))
          ) {
            const sideH = getDimsForMode('right', vw, vh).h;
            return { kind: 'side', side: 'right', topPx: clampSideDockTop((vh - sideH) * 0.5, sideH), h: sideH };
          }
        }
      }

      // 3. Default Station: Bottom Center
      return { kind: 'bottom-edge', x: 0, w: hDims.w, h: hDims.h };
    },
    [getDimsForMode]
  );

  // Keep dragged palette, orb & viewport metrics safely updated on window resize
  useEffect(() => {
    const clampOnResize = () => {
      const { vw, vh } = getLayoutViewport();
      setViewportSize({ vw, vh });
      setDockPlacement((prev) => {
        if (vw < 640 && prev.mode !== 'bottom') {
          return { mode: 'bottom' };
        }
        return prev;
      });
    };
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, []);

  const handleSelectTool = (tool: AnnotationTool) => {
    setIsDockSettingsOpen(false);
    setIsShortcutsOpen(false);
    setEditingSlot(null);
    setEditingColorSlot(null);
    if (tool === 'cursor') {
      setActiveTool(tool);
      setIsInspectorOpen(false);
      return;
    }
    if (activeTool === tool) {
      // Second tap on active Pen / Highlighter / Laser / Eraser toggles its options inspector
      setIsInspectorOpen((prev) => !prev);
      if (tool === 'eraser') {
        triggerRollerPulse();
      }
    } else {
      setActiveTool(tool);
      setIsInspectorOpen(false);
    }
  };

  // Synchronize dock GPU coordinates cleanly before first paint, on in-transit morph, and on snap/preset
  useLayoutEffect(() => {
    if (!isPaletteOpen) {
      dockLayoutReadyRef.current = false;
      dockPendingSpringRef.current = false;
      dockPendingMorphRef.current = false;
      pendingDragMorphRef.current = null;
      isAnimatingDockRef.current = false;
      return;
    }
    const el = dockRootRef.current;
    if (!el) return;

    const { vw, vh } = getLayoutViewport();
    const contentEl = dockContentRef.current;
    const w = contentEl?.offsetWidth || el.offsetWidth;
    const h = contentEl?.offsetHeight || el.offsetHeight;

    // Atomic pre-paint anchor update for live in-transit orientation morph during active drag
    // Centers directly on pointer without clamping shift so morphing never jumps by a single pixel
    if (dragStartRef.current) {
      const drag = dragStartRef.current;
      const morphInfo = pendingDragMorphRef.current;
      const capturedAspect = pendingAspectMorphRef.current;
      pendingAspectMorphRef.current = null;
      if (morphInfo && w > 0 && h > 0) {
        pendingDragMorphRef.current = null;
        if (morphInfo.targetMode === 'bottom') {
          horizDimsRef.current = { w, h };
        } else {
          sideDimsRef.current = { w, h };
        }
        if (nibsViewportRef.current) {
          nibsViewportRef.current.scrollTop = 0;
          nibsViewportRef.current.scrollLeft = 0;
        }
        if (!wasDragOrbFormedRef.current) {
          dockClipAnimRef.current?.stop();
          dockClipAnimRef.current = null;
          dockOrbCoreAnimRef.current?.stop();
          dockOrbCoreAnimRef.current = null;
          dockClipPath.set('none');
          dockOrbCoreOpacity.set(0);
          dockRootRef.current?.classList.remove('is-morphing-orb');
        }
        const safeMinLeft = 12;
        const safeMaxLeft = Math.max(safeMinLeft, vw - w - 12);
        const safeMinTop = 12;
        const safeMaxTop = Math.max(safeMinTop, vh - h - 14);
        const nextLeft = Math.max(safeMinLeft, Math.min(safeMaxLeft, morphInfo.clientX - w * 0.5));
        const nextTop = Math.max(safeMinTop, Math.min(safeMaxTop, morphInfo.clientY - h * 0.5));
        const shiftX = morphInfo.oldCx - (nextLeft + w * 0.5);
        const shiftY = morphInfo.oldCy - (nextTop + h * 0.5);
        const prevShiftVx = dockMorphShiftX.getVelocity();
        const prevShiftVy = dockMorphShiftY.getVelocity();
        stopDockShiftOnly();
        dockMorphShiftX.set(shiftX);
        dockMorphShiftY.set(shiftY);
        dockMorphShiftAnimXRef.current = animate(dockMorphShiftX, 0, {
          ...APPLE_CONTAINER_SPRING,
          velocity: prevShiftVx,
        });
        dockMorphShiftAnimYRef.current = animate(dockMorphShiftY, 0, {
          ...APPLE_CONTAINER_SPRING,
          velocity: prevShiftVy,
        });
        const isAspectSwap =
          (morphInfo.fromMode === 'bottom') !== (morphInfo.targetMode === 'bottom');
        if (isAspectSwap && capturedAspect) {
          startContainerAspectMorph(morphInfo.targetMode, w, h, vw, capturedAspect);
        }
        dockAnimScaleRef.current?.stop();
        dockAnimScaleRef.current = animate(dockScale, 0.985, APPLE_CONTAINER_SPRING);

        drag.liveLeft = nextLeft;
        drag.liveTop = nextTop;
        drag.grabOffsetX = w * 0.5;
        drag.grabOffsetY = h * 0.5;
        drag.morphedLocalCx = undefined;
        drag.morphedLocalCy = undefined;
        dockX.set(nextLeft);
        dockY.set(nextTop);
      } else if (capturedAspect) {
        capturedAspect.ghostEl?.remove();
      }
      return;
    }

    if (w > 0 && h > 0) {
      if (dockPlacement.mode === 'bottom') {
        horizDimsRef.current = { w, h };
      } else {
        sideDimsRef.current = { w, h };
      }
    }

    const dims =
      w > 0 && h > 0 ? { w, h } : getDimsForMode(dockPlacement.mode, vw, vh);
    const coords = getRestingDockCoords(dockPlacement, dims, vw, vh);

    if (!dockLayoutReadyRef.current) {
      dockLayoutReadyRef.current = true;
      dockPendingSpringRef.current = false;
      dockPendingMorphRef.current = false;
      dockPendingVelocityRef.current = null;
      dockPendingMorphFromCenterRef.current = null;
      const staleAspect = pendingAspectMorphRef.current;
      pendingAspectMorphRef.current = null;
      staleAspect?.ghostEl?.remove();
      dockRootRef.current?.classList.remove('is-morphing-orb');
      const fromOrb = dockOpeningFromOrbRef.current;
      dockOpeningFromOrbRef.current = null;
      if (fromOrb) {
        const { orbSize } = getOrbCornerMargins(vw);
        const startLeft = fromOrb.cx - dims.w * 0.5;
        const startTop = fromOrb.cy - dims.h * 0.5;
        const padX = Math.max(0, (dims.w - orbSize) * 0.5);
        const padY = Math.max(0, (dims.h - orbSize) * 0.5);
        dockOrbShellX.set(padX);
        dockOrbShellY.set(padY);
        dockX.set(startLeft);
        dockY.set(startTop);
        dockScale.set(0.92);
        dockOrbCoreAnimRef.current?.stop();
        dockOrbCoreOpacity.set(0.85);
        const coreAnim = animate(dockOrbCoreOpacity, 0, {
          duration: 0.09,
          ease: 'easeOut',
        });
        dockOrbCoreAnimRef.current = coreAnim;
        void coreAnim.finished.then(() => {
          if (dockOrbCoreAnimRef.current === coreAnim) {
            dockOrbCoreAnimRef.current = null;
            dockOrbCoreOpacity.set(0);
          }
        });
        dockClipPath.set(
          `inset(${padY.toFixed(1)}px ${padX.toFixed(1)}px ${padY.toFixed(1)}px ${padX.toFixed(1)}px round 999px)`
        );
        animateDockTo(coords.left, coords.top, false, false, null);
        dockAnimScaleRef.current?.stop();
        dockAnimScaleRef.current = animate(dockScale, 1, APPLE_DOCK_SPRING);
        dockClipAnimRef.current?.stop();
        const clipAnim = animate(
          dockClipPath,
          'inset(-28px -28px -28px -28px round 999px)',
          { duration: 0.26, ease: APPLE_IPAD_EASE }
        );
        dockClipAnimRef.current = clipAnim;
        void clipAnim.finished.then(() => {
          if (dockClipAnimRef.current === clipAnim) {
            dockClipAnimRef.current = null;
            dockClipPath.set('none');
          }
        });
        return;
      }
      dockClipAnimRef.current?.stop();
      dockClipAnimRef.current = null;
      dockOrbCoreAnimRef.current?.stop();
      dockOrbCoreAnimRef.current = null;
      dockOrbCoreOpacity.set(0);
      dockClipPath.set('none');
      animateDockTo(coords.left, coords.top, true);
      return;
    }

    if (dockPendingSpringRef.current) {
      const morphPulse = dockPendingMorphRef.current;
      const releaseVel = dockPendingVelocityRef.current;
      const morphCenter = dockPendingMorphFromCenterRef.current;
      const capturedAspect = pendingAspectMorphRef.current;
      dockPendingSpringRef.current = false;
      dockPendingMorphRef.current = false;
      dockPendingMorphDirectionRef.current = null;
      dockPendingMorphSideRef.current = null;
      dockPendingMorphSourceRef.current = 'drag';
      dockPendingVelocityRef.current = null;
      dockPendingMorphFromCenterRef.current = null;
      pendingAspectMorphRef.current = null;

      stopDockShiftOnly();
      dockMorphShiftX.set(0);
      dockMorphShiftY.set(0);
      dockMorphScaleX.set(1);
      dockMorphScaleY.set(1);
      dockMorphRotate.set(0);

      if (morphCenter) {
        const startLeft = morphCenter.cx - dims.w * 0.5;
        const startTop = morphCenter.cy - dims.h * 0.5;
        dockX.set(startLeft);
        dockY.set(startTop);
      }
      if (capturedAspect) {
        if (nibsViewportRef.current) {
          nibsViewportRef.current.scrollTop = 0;
          nibsViewportRef.current.scrollLeft = 0;
        }
        startContainerAspectMorph(dockPlacement.mode, dims.w, dims.h, vw, capturedAspect);
      }
      if (Math.abs(dockScale.get() - 1) > 0.002) {
        dockAnimScaleRef.current?.stop();
        dockAnimScaleRef.current = animate(dockScale, 1, APPLE_CONTAINER_SPRING);
      }
      animateDockTo(coords.left, coords.top, false, morphPulse, releaseVel);
      return;
    }

    if (pendingAspectMorphRef.current) {
      const stray = pendingAspectMorphRef.current;
      pendingAspectMorphRef.current = null;
      stray.ghostEl?.remove();
    }

    if (!wasDragOrbFormedRef.current && !dockWasCollapsedIntoOrbRef.current && dockOrbCoreAnimRef.current === null) {
      dockOrbCoreOpacity.set(0);
      dockRootRef.current?.classList.remove('is-morphing-orb');
    }
    if (
      isAnimatingDockRef.current &&
      dockAnimTargetRef.current &&
      Math.abs(dockAnimTargetRef.current.x - coords.left) < 2 &&
      Math.abs(dockAnimTargetRef.current.y - coords.top) < 2
    ) {
      return;
    }
    animateDockTo(coords.left, coords.top, !isAnimatingDockRef.current);
  }, [
    isPaletteOpen,
    dockPlacement,
    liveDragMode,
    viewportSize,
    systemSettings.enabledOptionalTools,
    animateDockTo,
    dockClipPath,
    dockMorphRotate,
    dockMorphScaleX,
    dockMorphScaleY,
    dockMorphShiftX,
    dockMorphShiftY,
    dockOrbCoreOpacity,
    dockOrbShellX,
    dockOrbShellY,
    dockScale,
    dockX,
    dockY,
    getDimsForMode,
    getRestingDockCoords,
    startContainerAspectMorph,
    stopDockShiftOnly,
  ]);

  // Steady-state invariant: an open, idle bar must never retain an orb shell overlay, tilt, or residual clip/scale
  useEffect(() => {
    if (!isPaletteOpen || isDragging) return;
    const timer = window.setTimeout(() => {
      if (
        dragStartRef.current ||
        wasDragOrbFormedRef.current ||
        dockWasCollapsedIntoOrbRef.current ||
        isAnimatingDockRef.current ||
        isAspectMorphingRef.current ||
        dockClipAnimRef.current !== null
      ) {
        return;
      }
      stopDockMorphMotion();
      dockRootRef.current?.classList.remove('is-morphing-orb');
      if (dockOrbCoreOpacity.get() !== 0) {
        dockOrbCoreOpacity.set(0);
      }
      if (dockClipPath.get() !== 'none') {
        dockClipPath.set('none');
      }
      if (dockMorphScaleAnimXRef.current === null && Math.abs(dockMorphScaleX.get() - 1) > 0.002) {
        dockMorphScaleX.set(1);
      }
      if (dockMorphScaleAnimYRef.current === null && Math.abs(dockMorphScaleY.get() - 1) > 0.002) {
        dockMorphScaleY.set(1);
      }
      if (dockMorphRotateAnimRef.current === null && Math.abs(dockMorphRotate.get()) > 0.05) {
        dockMorphRotate.set(0);
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [isPaletteOpen, isDragging, dockClipPath, dockMorphRotate, dockMorphScaleX, dockMorphScaleY, dockOrbCoreOpacity, stopDockMorphMotion]);

  // Keep live dimensions & resting center aligned without ever interrupting drag, aspect morph, or an active spring glide
  useEffect(() => {
    if (!isPaletteOpen) return;
    const el = dockRootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (
        isAspectMorphingRef.current ||
        dragStartRef.current ||
        dockPendingSpringRef.current ||
        !dockLayoutReadyRef.current
      ) {
        return;
      }
      const measureTarget = dockContentRef.current || el;
      const w = measureTarget.offsetWidth;
      const h = measureTarget.offsetHeight;
      if (w <= 0 || h <= 0) return;

      const mode = dockPlacementRef.current.mode;
      if (mode === 'bottom') {
        horizDimsRef.current = { w, h };
      } else {
        sideDimsRef.current = { w, h };
      }

      const { vw, vh } = getLayoutViewport();
      const coords = getRestingDockCoords(dockPlacementRef.current, { w, h }, vw, vh);
      if (isAnimatingDockRef.current) {
        if (
          dockAnimTargetRef.current &&
          (Math.abs(dockAnimTargetRef.current.x - coords.left) > 2 ||
            Math.abs(dockAnimTargetRef.current.y - coords.top) > 2)
        ) {
          animateDockTo(coords.left, coords.top, false);
        }
      } else if (
        Math.abs(dockX.get() - coords.left) > 0.8 ||
        Math.abs(dockY.get() - coords.top) > 0.8
      ) {
        animateDockTo(coords.left, coords.top, false);
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isPaletteOpen, animateDockTo, dockX, dockY, getRestingDockCoords]);

  // Synchronize minimized orb GPU coordinates in place
  useLayoutEffect(() => {
    if (isPaletteOpen) {
      orbLayoutReadyRef.current = false;
      orbPendingSpringRef.current = false;
      orbDragRef.current = null;
      orbDragMagnetRef.current = null;
      setIsOrbDragging((prev) => (prev ? false : prev));
      setOrbDragTarget((prev) => (prev !== null ? null : prev));
      setOrbDragMagnet((prev) => (prev !== null ? null : prev));
      return;
    }
    if (orbDragRef.current?.moved) return;

    const { vw, vh } = getLayoutViewport();
    const resolved = resolveOrbCoords(orbPos, vw, vh);
    const targetLeft = resolved.left;
    const targetTop = resolved.top;

    if (!orbLayoutReadyRef.current) {
      orbLayoutReadyRef.current = true;
      const flight = orbPendingFlightRef.current;
      orbPendingFlightRef.current = null;
      orbPendingSpringRef.current = false;
      orbPendingVelocityRef.current = null;
      if (flight) {
        orbX.set(flight.startLeft);
        orbY.set(flight.startTop);
        animateOrbTo(targetLeft, targetTop, false, { vx: flight.vx, vy: flight.vy });
        return;
      }
      animateOrbTo(targetLeft, targetTop, true);
      return;
    }

    if (orbPendingSpringRef.current) {
      const orbVel = orbPendingVelocityRef.current;
      orbPendingSpringRef.current = false;
      orbPendingVelocityRef.current = null;
      animateOrbTo(targetLeft, targetTop, false, orbVel);
      return;
    }

    animateOrbTo(targetLeft, targetTop, true);
  }, [isPaletteOpen, orbPos, viewportSize, animateOrbTo, orbX, orbY]);

  // Safety invariant: when minimized and idle, the orb must never stay hidden or stranded outside its two exact corners
  useEffect(() => {
    if (isPaletteOpen || isOrbDragging) return;
    const timer = window.setTimeout(() => {
      if (orbDragRef.current) return;
      if (orbLauncherOpacity.get() < 1) {
        orbLauncherOpacity.set(1);
      }
      const { vw, vh } = getLayoutViewport();
      const resolved = resolveOrbCoords(orbPosRef.current, vw, vh);
      if (
        Math.abs(orbX.get() - resolved.left) > 1.5 ||
        Math.abs(orbY.get() - resolved.top) > 1.5
      ) {
        animateOrbTo(resolved.left, resolved.top, false, null);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [isPaletteOpen, isOrbDragging, orbPos, viewportSize, animateOrbTo, orbLauncherOpacity, orbX, orbY]);

  const snapDockToPreset = useCallback(
    (targetMode: DockPlacement['mode']) => {
      if (typeof window === 'undefined') return;
      const { vw, vh } = getLayoutViewport();
      const resolvedMode: DockPlacement['mode'] =
        vw < 640 && (targetMode === 'left' || targetMode === 'right') ? 'bottom' : targetMode;

      const nextPlacement: DockPlacement = { mode: resolvedMode };

      const prevMode = dockPlacementRef.current.mode;
      const prevIsSide = prevMode === 'left' || prevMode === 'right';
      const nextIsSide = resolvedMode === 'left' || resolvedMode === 'right';

      if (pendingAspectMorphRef.current) {
        pendingAspectMorphRef.current.ghostEl?.remove();
        pendingAspectMorphRef.current = null;
      }
      if (prevIsSide !== nextIsSide) {
        const curDims = getDimsForMode(prevMode, vw, vh);
        dockPendingMorphFromCenterRef.current = {
          cx: dockX.get() + curDims.w * 0.5,
          cy: dockY.get() + curDims.h * 0.5,
        };
        pendingAspectMorphRef.current = captureAspectMorphStart(prevMode, vw, curDims);
      } else {
        dockPendingMorphFromCenterRef.current = null;
      }

      setIsInspectorOpen(false);
      setIsDockSettingsOpen(false);
      setIsShortcutsOpen(false);
      setEditingSlot(null);
      setEditingColorSlot(null);
      dockPendingMorphRef.current = prevIsSide !== nextIsSide;
      dockPendingMorphDirectionRef.current =
        prevIsSide !== nextIsSide ? (nextIsSide ? 'to-side' : 'to-bottom') : null;
      dockPendingMorphSideRef.current =
        prevIsSide !== nextIsSide
          ? nextIsSide
            ? resolvedMode === 'left' || resolvedMode === 'right'
              ? resolvedMode
              : null
            : prevMode === 'left' || prevMode === 'right'
            ? prevMode
            : null
          : null;
      dockPendingMorphSourceRef.current = 'preset';
      dockPendingSpringRef.current = true;
      setDockPlacement(nextPlacement);
    },
    [captureAspectMorphStart, dockX, dockY, getDimsForMode]
  );

  const beginActiveDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number, startTime?: number) => {
      const dockEl = dockRootRef.current;
      if (!dockEl) return;
      if (typeof document !== 'undefined') {
        document.body.classList.add('is-palette-dragging');
      }
      stopDockMotion();
      dockMorphShiftX.set(0);
      dockMorphShiftY.set(0);
      dockMorphScaleX.set(1);
      dockMorphScaleY.set(1);
      dockMorphRotate.set(0);
      dockPendingMorphDirectionRef.current = null;
      dockPendingMorphSideRef.current = null;
      wasDragOrbFormedRef.current = false;
      dockRootRef.current?.classList.remove('is-morphing-orb');
      dockClipPath.set('none');
      dockOrbCoreOpacity.set(0);
      dockWasCollapsedIntoOrbRef.current = false;
      dockCollapsedFromDragRef.current = false;
      dockPendingSpringRef.current = false;
      dockPendingMorphRef.current = false;
      pendingDragMorphRef.current = null;
      if (pendingAspectMorphRef.current) {
        pendingAspectMorphRef.current.ghostEl?.remove();
        pendingAspectMorphRef.current = null;
      }
      dockLatestPointerRef.current = null;
      if (dockMoveRafRef.current !== null) {
        window.cancelAnimationFrame(dockMoveRafRef.current);
        dockMoveRafRef.current = null;
      }
      try {
        dockEl.setPointerCapture(pointerId);
      } catch {
        // Ignore synthetic capture errors
      }
      if (document.activeElement instanceof HTMLElement && dockEl.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      const dockW = dockEl.offsetWidth || dockEl.getBoundingClientRect().width;
      const dockH = dockEl.offsetHeight || dockEl.getBoundingClientRect().height;
      setIsInspectorOpen(false);
      setIsDockSettingsOpen(false);
      setIsShortcutsOpen(false);
      setEditingSlot(null);
      setEditingColorSlot(null);

      const startMode: 'bottom' | 'left' | 'right' =
        dockPlacementRef.current.mode === 'left' || dockPlacementRef.current.mode === 'right'
          ? dockPlacementRef.current.mode
          : 'bottom';
      if (startMode === 'bottom') {
        horizDimsRef.current = { w: dockW, h: dockH };
      } else {
        sideDimsRef.current = { w: dockW, h: dockH };
      }

      const { vw, vh } = getLayoutViewport();
      const initLeft = Math.max(14, Math.min(Math.max(14, vw - dockW - 14), dockX.get()));
      const initTop = Math.max(14, Math.min(Math.max(14, vh - dockH - 16), dockY.get()));

      dockX.set(initLeft);
      dockY.set(initTop);
      dockScale.set(1);
      lastDropPreviewRef.current = null;

      const grabX = Math.max(12, Math.min(dockW - 12, clientX - initLeft));
      const grabY = Math.max(12, Math.min(dockH - 12, clientY - initTop));

      setIsDragging(true);
      setHasDragMorphed(false);
      setLiveDragMode(startMode);
      setDropPreview(null);
      const dragStartTime = performance.now();
      dragStartRef.current = {
        pointerId,
        startClientX: clientX,
        startClientY: clientY,
        grabOffsetX: grabX,
        grabOffsetY: grabY,
        liveLeft: initLeft,
        liveTop: initTop,
        initialMode: startMode,
        currentMode: startMode,
        hasMorphed: false,
        modeEnteredAt: dragStartTime,
        modeAnchorX: clientX,
        modeAnchorY: clientY,
        lastClientX: clientX,
        lastClientY: clientY,
        lastTime: startTime ?? dragStartTime,
        vx: 0,
        vy: 0,
        orbMagnetBlend: 0,
        sideMagnetBlend: 0,
        bottomMagnetBlend: 0,
      };
    },
    [dockMorphRotate, dockMorphScaleX, dockMorphScaleY, dockMorphShiftX, dockMorphShiftY, dockScale, dockX, dockY, stopDockMotion]
  );

  const stepActiveDrag = useCallback(
    (clientX: number, clientY: number, allowMorph = true) => {
      const drag = dragStartRef.current;
      if (!drag) return;
      const now = performance.now();
      const dt = Math.max(4, now - drag.lastTime);
      const stepDx = clientX - drag.lastClientX;
      const stepDy = clientY - drag.lastClientY;
      const stepDist = Math.hypot(stepDx, stepDy);
      const instVx = stepDx / dt;
      const instVy = stepDy / dt;
      drag.vx = 0.38 * instVx + 0.62 * drag.vx;
      drag.vy = 0.38 * instVy + 0.62 * drag.vy;
      drag.lastClientX = clientX;
      drag.lastClientY = clientY;
      drag.lastTime = now;

      const { vw, vh } = getLayoutViewport();
      const dims = getDimsForMode(drag.currentMode, vw, vh);

      // Smoothly glide off-center grab offsets toward center while dragging as an un-morphed bar;
      // once condensed into an orb, keep the orb locked right under the pointer
      if (stepDist > 0.5 && !wasDragOrbFormedRef.current) {
        const recenterFactor = Math.min(0.22, stepDist / 160);
        drag.grabOffsetX += (dims.w * 0.5 - drag.grabOffsetX) * recenterFactor;
        drag.grabOffsetY += (dims.h * 0.5 - drag.grabOffsetY) * recenterFactor;
      }

      const rawLeft = clientX - drag.grabOffsetX;
      const rawTop = clientY - drag.grabOffsetY;

      const nx = clientX / Math.max(1, vw);
      const ny = clientY / Math.max(1, vh);
      const totalDxFromStart = clientX - drag.startClientX;

      const totalDyFromStart = clientY - drag.startClientY;
      const modeElapsedMsNow = now - drag.modeEnteredAt;
      const cornerPocket = getDockCornerPocketMetrics(vw, vh);
      const sideEnterX = Math.min(265, vw * 0.22);
      const sideExitLeftX = Math.max(vw * 0.28, sideEnterX + 52);
      const sideExitRightX = vw - sideExitLeftX;
      const bottomSafeLeftX = cornerPocket.zoneW + 36;
      const bottomSafeRightX = vw - bottomSafeLeftX;
      const dragDistFromStart = Math.hypot(totalDxFromStart, totalDyFromStart);
      const modeDx = clientX - drag.modeAnchorX;
      const sweepSideContext: 'bottom' | 'left' | 'right' =
        drag.currentMode === 'left' || drag.currentMode === 'right'
          ? drag.currentMode
          : drag.hasMorphed && modeElapsedMsNow < 280
          ? drag.initialMode
          : 'bottom';
      const sweepingInwardFromSide =
        !wasDragOrbFormedRef.current &&
        ((sweepSideContext === 'left' && drag.vx > 0.055 && clientX > 52) ||
          (sweepSideContext === 'right' && drag.vx < -0.055 && clientX < vw - 52));
      const inCornerMagnetNow =
        !sweepingInwardFromSide &&
        (dragDistFromStart >= 20 || wasDragOrbFormedRef.current) &&
        detectCornerMagnet(
          clientX,
          clientY,
          vw,
          vh,
          lastDropPreviewRef.current?.kind === 'orb' ? lastDropPreviewRef.current.side : null,
          true
        ) !== null;

      // Proactive In-Transit Morphing with strict non-overlapping hysteresis buffer so horizontal/vertical transitions never oscillate
      if (
        allowMorph &&
        !inCornerMagnetNow &&
        vw >= 640 &&
        (!drag.hasMorphed || modeElapsedMsNow >= 120)
      ) {
        let nextMorphMode: 'bottom' | 'left' | 'right' | null = null;

        if (drag.currentMode === 'bottom') {
          if (ny < 0.79 && (dragDistFromStart >= 24 || drag.hasMorphed)) {
            if (
              clientX <= sideEnterX &&
              (modeDx <= -8 || Math.abs(totalDyFromStart) >= 24 || clientX <= Math.min(140, sideEnterX * 0.7))
            ) {
              nextMorphMode = 'left';
            } else if (
              clientX >= vw - sideEnterX &&
              (modeDx >= 8 || Math.abs(totalDyFromStart) >= 24 || clientX >= vw - Math.min(140, sideEnterX * 0.7))
            ) {
              nextMorphMode = 'right';
            }
          }
        } else if (drag.currentMode === 'left') {
          if (clientX >= vw - sideEnterX && ny < 0.79) {
            nextMorphMode = 'right';
          } else if (clientX >= sideExitLeftX || (ny >= 0.79 && clientX > bottomSafeLeftX)) {
            nextMorphMode = 'bottom';
          }
        } else if (drag.currentMode === 'right') {
          if (clientX <= sideEnterX && ny < 0.79) {
            nextMorphMode = 'left';
          } else if (clientX <= sideExitRightX || (ny >= 0.79 && clientX < bottomSafeRightX)) {
            nextMorphMode = 'bottom';
          }
        }

        if (nextMorphMode && nextMorphMode !== drag.currentMode) {
          const prevDragMode = drag.currentMode;
          const oldCx =
            (Number.isFinite(drag.liveLeft) ? drag.liveLeft : clientX - drag.grabOffsetX) +
            dims.w * 0.5 +
            dockMorphShiftX.get();
          const oldCy =
            (Number.isFinite(drag.liveTop) ? drag.liveTop : clientY - drag.grabOffsetY) +
            dims.h * 0.5 +
            dockMorphShiftY.get();
          const wasAlreadyMorphed = drag.hasMorphed;
          const isAspectSwap =
            (prevDragMode === 'bottom') !== (nextMorphMode === 'bottom');
          if (pendingAspectMorphRef.current) {
            pendingAspectMorphRef.current.ghostEl?.remove();
            pendingAspectMorphRef.current = null;
          }
          if (isAspectSwap) {
            pendingAspectMorphRef.current = captureAspectMorphStart(prevDragMode, vw, dims);
          }
          drag.currentMode = nextMorphMode;
          drag.hasMorphed = true;
          drag.modeEnteredAt = now;
          drag.modeAnchorX = clientX;
          drag.modeAnchorY = clientY;
          pendingDragMorphRef.current = {
            clientX,
            clientY,
            fromMode: prevDragMode,
            targetMode: nextMorphMode,
            oldCx,
            oldCy,
          };
          const nextDims = getDimsForMode(nextMorphMode, vw, vh);
          const nextPreviewTarget: DockDropTarget =
            nextMorphMode === 'bottom'
              ? { kind: 'bottom-edge', x: 0, w: nextDims.w, h: nextDims.h }
              : {
                  kind: 'side',
                  side: nextMorphMode,
                  topPx: clampSideDockTop((vh - nextDims.h) * 0.5, nextDims.h),
                  h: nextDims.h,
                };
          commitDropPreviewIfChanged(nextPreviewTarget);
          if (!wasAlreadyMorphed) {
            setHasDragMorphed(true);
          }
          setLiveDragMode(nextMorphMode);
          return;
        }
      }

      // Keep the dock gracefully cushioned inside padded viewport walls so hitting an edge slides along it instead of sinking off-screen
      const safeMinLeft = 12;
      const safeMaxLeft = Math.max(safeMinLeft, vw - dims.w - 12);
      const safeMinTop = 12;
      const safeMaxTop = Math.max(safeMinTop, vh - dims.h - 14);

      const visualLeft = rubberBandClamp(rawLeft, safeMinLeft, safeMaxLeft, 5);
      const visualTop = rubberBandClamp(rawTop, safeMinTop, safeMaxTop, 5);

      const modeElapsedMs = now - drag.modeEnteredAt;
      const allowSideOutwardCollapse = !drag.hasMorphed || modeElapsedMs >= 140;

      const nextTarget = computeDropTarget(
        drag.currentMode,
        rawLeft,
        rawTop,
        dims.w,
        dims.h,
        clientX,
        clientY,
        drag.modeAnchorX,
        drag.modeAnchorY,
        drag.vx,
        drag.vy,
        clientY - drag.modeAnchorY,
        allowSideOutwardCollapse,
        drag.hasMorphed,
        modeElapsedMs,
        clientY - drag.startClientY,
        totalDxFromStart
      );

      const { orbSize } = getOrbCornerMargins(vw);
      let effectiveLeft = visualLeft;
      let effectiveTop = visualTop;

      if (nextTarget?.kind === 'orb') {
        const localCx =
          drag.morphedLocalCx ??
          Math.max(
            orbSize * 0.5,
            Math.min(Math.max(orbSize * 0.5, dims.w - orbSize * 0.5), clientX - visualLeft)
          );
        const localCy =
          drag.morphedLocalCy ??
          Math.max(
            orbSize * 0.5,
            Math.min(Math.max(orbSize * 0.5, dims.h - orbSize * 0.5), clientY - visualTop)
          );
        if (!wasDragOrbFormedRef.current) {
          wasDragOrbFormedRef.current = true;
          drag.morphedLocalCx = localCx;
          drag.morphedLocalCy = localCy;
          morphDockToOrbVisual(dims, 0.19, vw, localCx, localCy);
          dockMorphScaleAnimXRef.current?.stop();
          dockMorphScaleAnimYRef.current?.stop();
          dockMorphRotateAnimRef.current?.stop();
          dockMorphScaleAnimXRef.current = animate(dockMorphScaleX, 1, { duration: 0.14, ease: APPLE_CALM_EASE });
          dockMorphScaleAnimYRef.current = animate(dockMorphScaleY, 1, { duration: 0.14, ease: APPLE_CALM_EASE });
          dockMorphRotateAnimRef.current = animate(dockMorphRotate, 0, { duration: 0.12, ease: APPLE_CALM_EASE });
          dockAnimScaleRef.current?.stop();
          dockAnimScaleRef.current = animate(dockScale, 1, { duration: 0.16, ease: APPLE_CALM_EASE });
        }
        drag.lastOrbCoords = {
          left: nextTarget.left,
          top: nextTarget.top,
          localCx,
          localCy,
        };
        drag.sideMagnetBlend = Math.max(0, drag.sideMagnetBlend - dt / 70);
        drag.bottomMagnetBlend = Math.max(0, drag.bottomMagnetBlend - dt / 70);
        drag.orbMagnetBlend = Math.min(1, drag.orbMagnetBlend + dt / 95);
        const b = drag.orbMagnetBlend;
        const easedPull = 0.34 * (1 - (1 - b) * (1 - b));
        const cornerCx = nextTarget.left + orbSize * 0.5;
        const cornerCy = nextTarget.top + orbSize * 0.5;
        const cornerDockLeft = cornerCx - localCx;
        const cornerDockTop = cornerCy - localCy;
        effectiveLeft = visualLeft + (cornerDockLeft - visualLeft) * easedPull;
        effectiveTop = visualTop + (cornerDockTop - visualTop) * easedPull;
      } else {
        if (wasDragOrbFormedRef.current) {
          wasDragOrbFormedRef.current = false;
          drag.morphedLocalCx = undefined;
          drag.morphedLocalCy = undefined;
          unmorphDockFromOrbVisual();
        }
        if (drag.orbMagnetBlend > 0) {
          drag.orbMagnetBlend = Math.max(0, drag.orbMagnetBlend - dt / 85);
          if (drag.orbMagnetBlend > 0 && drag.lastOrbCoords) {
            const b = drag.orbMagnetBlend;
            const easedPull = 0.34 * (1 - (1 - b) * (1 - b));
            const prevOrb = drag.lastOrbCoords;
            const cornerDockLeft = prevOrb.left + orbSize * 0.5 - prevOrb.localCx;
            const cornerDockTop = prevOrb.top + orbSize * 0.5 - prevOrb.localCy;
            effectiveLeft = visualLeft + (cornerDockLeft - visualLeft) * easedPull;
            effectiveTop = visualTop + (cornerDockTop - visualTop) * easedPull;
          } else if (drag.orbMagnetBlend === 0) {
            drag.lastOrbCoords = undefined;
          }
        } else if (nextTarget?.kind === 'side' && nextTarget.side === drag.currentMode) {
          drag.bottomMagnetBlend = Math.max(0, drag.bottomMagnetBlend - dt / 80);
          const wallLeft =
            nextTarget.side === 'left' ? SIDE_DOCK_MARGIN_X : vw - SIDE_DOCK_MARGIN_X - dims.w;
          drag.lastSideTarget = {
            side: nextTarget.side,
            wallLeft,
            topPx: nextTarget.topPx,
          };
          drag.sideMagnetBlend = Math.min(1, drag.sideMagnetBlend + dt / 110);
          const sb = drag.sideMagnetBlend;
          const wallDist = Math.abs(visualLeft - wallLeft);
          const proximity = Math.max(0, Math.min(1, 1 - wallDist / Math.max(150, sideEnterX)));
          const easedSide = (1 - (1 - sb) * (1 - sb)) * (0.35 + 0.65 * proximity);
          effectiveLeft = visualLeft + (wallLeft - visualLeft) * (0.48 * easedSide);
          effectiveTop = visualTop + (nextTarget.topPx - visualTop) * (0.16 * easedSide);
        } else if (
          drag.currentMode === 'bottom' &&
          nextTarget?.kind === 'bottom-edge' &&
          (ny >= 0.72 || visualTop >= vh - BOTTOM_DOCK_MARGIN - dims.h - 85)
        ) {
          drag.sideMagnetBlend = Math.max(0, drag.sideMagnetBlend - dt / 80);
          const bottomRestTop = vh - BOTTOM_DOCK_MARGIN - dims.h;
          const bottomRestLeft = (vw - dims.w) * 0.5;
          drag.lastBottomTarget = { restLeft: bottomRestLeft, restTop: bottomRestTop };
          drag.bottomMagnetBlend = Math.min(1, drag.bottomMagnetBlend + dt / 110);
          const bb = drag.bottomMagnetBlend;
          const floorDist = Math.max(0, bottomRestTop - visualTop);
          const proximity = Math.max(0, Math.min(1, 1 - floorDist / 110));
          const easedBottom = (1 - (1 - bb) * (1 - bb)) * (0.28 + 0.72 * proximity);
          effectiveTop = visualTop + (bottomRestTop - visualTop) * (0.58 * easedBottom);
          effectiveLeft = visualLeft + (bottomRestLeft - visualLeft) * (0.14 * easedBottom);
        } else {
          if (drag.sideMagnetBlend > 0) {
            drag.sideMagnetBlend = Math.max(0, drag.sideMagnetBlend - dt / 90);
            if (drag.sideMagnetBlend > 0 && drag.lastSideTarget) {
              const sb = drag.sideMagnetBlend;
              const prevSide = drag.lastSideTarget;
              const easedOut = 1 - (1 - sb) * (1 - sb);
              effectiveLeft = visualLeft + (prevSide.wallLeft - visualLeft) * (0.36 * easedOut);
              effectiveTop = visualTop + (prevSide.topPx - visualTop) * (0.14 * easedOut);
            } else if (drag.sideMagnetBlend === 0) {
              drag.lastSideTarget = undefined;
            }
          }
          if (drag.bottomMagnetBlend > 0) {
            drag.bottomMagnetBlend = Math.max(0, drag.bottomMagnetBlend - dt / 85);
            if (drag.bottomMagnetBlend > 0 && drag.lastBottomTarget) {
              const bb = drag.bottomMagnetBlend;
              const prevBottom = drag.lastBottomTarget;
              const easedOut = 1 - (1 - bb) * (1 - bb);
              effectiveTop = visualTop + (prevBottom.restTop - visualTop) * (0.42 * easedOut);
              effectiveLeft = visualLeft + (prevBottom.restLeft - visualLeft) * (0.12 * easedOut);
            } else if (drag.bottomMagnetBlend === 0) {
              drag.lastBottomTarget = undefined;
            }
          }
        }

        // Conflict-free fluid drag lift & corner-pocket condensation (zero rotation-sign flip or conflicting scale skew)
        if (!wasDragOrbFormedRef.current) {
          let desiredScale = 0.985;
          if (!sweepingInwardFromSide && ny >= 0.72) {
            const cornerLeftGap = Math.hypot(
              Math.max(0, clientX - cornerPocket.zoneW),
              Math.max(0, cornerPocket.zoneTop - clientY)
            );
            const cornerRightGap = Math.hypot(
              Math.max(0, vw - cornerPocket.zoneW - clientX),
              Math.max(0, cornerPocket.zoneTop - clientY)
            );
            const tCorner = Math.max(0, Math.min(1, 1 - Math.min(cornerLeftGap, cornerRightGap) / 96));
            const cornerA = tCorner * tCorner * (3 - 2 * tCorner);
            desiredScale = 0.985 - 0.045 * cornerA;
          }
          dockAnimScaleRef.current?.stop();
          dockAnimScaleRef.current = null;
          const lerpAlpha = 1 - Math.exp(-dt / 42);
          dockScale.set(dockScale.get() + (desiredScale - dockScale.get()) * lerpAlpha);
        }
      }

      drag.liveLeft = effectiveLeft;
      drag.liveTop = effectiveTop;

      // Direct GPU MotionValue updates synced to display VSync
      dockX.set(effectiveLeft);
      dockY.set(effectiveTop);

      commitDropPreviewIfChanged(nextTarget);
    },
    [
      captureAspectMorphStart,
      commitDropPreviewIfChanged,
      computeDropTarget,
      dockMorphRotate,
      dockMorphScaleX,
      dockMorphScaleY,
      dockMorphShiftX,
      dockMorphShiftY,
      dockScale,
      dockX,
      dockY,
      getDimsForMode,
      morphDockToOrbVisual,
      unmorphDockFromOrbVisual,
    ]
  );

  const finishActiveDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (dockMoveRafRef.current !== null) {
        window.cancelAnimationFrame(dockMoveRafRef.current);
        dockMoveRafRef.current = null;
      }
      dockLatestPointerRef.current = null;

      const drag = dragStartRef.current;
      if (!drag) return;
      const droppedPendingMorph = pendingDragMorphRef.current;
      if (droppedPendingMorph) {
        const { vw: vw0, vh: vh0 } = getLayoutViewport();
        const mDims = getDimsForMode(droppedPendingMorph.targetMode, vw0, vh0);
        const startCx = Number.isFinite(droppedPendingMorph.oldCx)
          ? droppedPendingMorph.oldCx
          : clientX;
        const startCy = Number.isFinite(droppedPendingMorph.oldCy)
          ? droppedPendingMorph.oldCy
          : clientY;
        drag.liveLeft = startCx - mDims.w * 0.5;
        drag.liveTop = startCy - mDims.h * 0.5;
        drag.grabOffsetX = mDims.w * 0.5;
        drag.grabOffsetY = mDims.h * 0.5;
        pendingDragMorphRef.current = null;
        dockX.set(drag.liveLeft);
        dockY.set(drag.liveTop);
      }
      if (Math.hypot(clientX - drag.lastClientX, clientY - drag.lastClientY) >= 2) {
        stepActiveDrag(clientX, clientY, false);
      }
      const pendingShiftX = dockMorphShiftX.get();
      const pendingShiftY = dockMorphShiftY.get();
      const shiftVx = dockMorphShiftX.getVelocity();
      const shiftVy = dockMorphShiftY.getVelocity();
      stopDockShiftOnly();
      dockMorphShiftX.set(0);
      dockMorphShiftY.set(0);
      if (Math.abs(pendingShiftX) > 0.1 || Math.abs(pendingShiftY) > 0.1) {
        drag.liveLeft += pendingShiftX;
        drag.liveTop += pendingShiftY;
        dockX.set(drag.liveLeft);
        dockY.set(drag.liveTop);
      }
      try {
        if (dockRootRef.current?.hasPointerCapture(drag.pointerId)) {
          dockRootRef.current.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Ignore release errors
      }
      const finalMode = drag.currentMode;
      const rawLeft = clientX - drag.grabOffsetX;
      const rawTop = clientY - drag.grabOffsetY;
      const finalLeft = drag.liveLeft;
      const finalTop = drag.liveTop;
      const idleMs = performance.now() - drag.lastTime;
      const finalVx = idleMs > 90 ? 0 : drag.vx;
      const finalVy = idleMs > 90 ? 0 : drag.vy;
      const anchorX = drag.modeAnchorX;
      const anchorY = drag.modeAnchorY;
      const dyTotal = clientY - anchorY;
      const totalDyFromDragStart = clientY - drag.startClientY;
      const dragStartX = drag.startClientX;
      const finalHasMorphed = drag.hasMorphed;
      const finalModeElapsedMs = performance.now() - drag.modeEnteredAt;
      const allowSideOutwardCollapse = !finalHasMorphed || finalModeElapsedMs >= 140;

      const { vw, vh } = getLayoutViewport();
      const finalDims = getDimsForMode(finalMode, vw, vh);
      const target = computeDropTarget(
        finalMode,
        rawLeft,
        rawTop,
        finalDims.w,
        finalDims.h,
        clientX,
        clientY,
        anchorX,
        anchorY,
        finalVx,
        finalVy,
        dyTotal,
        allowSideOutwardCollapse,
        finalHasMorphed,
        finalModeElapsedMs,
        totalDyFromDragStart,
        clientX - dragStartX,
        true
      );

      const wasInFormedOrb = wasDragOrbFormedRef.current;
      const savedLocalCx = drag.morphedLocalCx;
      const savedLocalCy = drag.morphedLocalCy;
      const savedGrabX = drag.grabOffsetX;
      const savedGrabY = drag.grabOffsetY;
      dragStartRef.current = null;
      lastDropPreviewRef.current = null;
      wasDragOrbFormedRef.current = false;
      if (typeof document !== 'undefined') {
        document.body.classList.remove('is-palette-dragging');
      }
      setIsDragging(false);
      setHasDragMorphed(false);
      setLiveDragMode(null);
      setDropPreview(null);

      // Morph the bar into its round 58x58 orb around the grab point and fling it straight into the fixed corner orb
      if (target?.kind === 'orb') {
        const targetSide = target.side;
        const { orbSize } = getOrbCornerMargins(vw);
        const localCx =
          savedLocalCx ??
          Math.max(
            orbSize * 0.5,
            Math.min(Math.max(orbSize * 0.5, finalDims.w - orbSize * 0.5), savedGrabX)
          );
        const localCy =
          savedLocalCy ??
          Math.max(
            orbSize * 0.5,
            Math.min(Math.max(orbSize * 0.5, finalDims.h - orbSize * 0.5), savedGrabY)
          );
        collapseDockIntoCornerOrb({
          targetSide,
          dims: finalDims,
          orbCxOnDock: finalLeft + localCx,
          orbCyOnDock: finalTop + localCy,
          vw,
          vh,
          fromDrag: true,
          skipVisualMorph: wasInFormedOrb,
          localCx,
          localCy,
        });
        return;
      }

      if (wasInFormedOrb) {
        unmorphDockFromOrbVisual();
      }

      const effectiveFromMode = droppedPendingMorph ? droppedPendingMorph.fromMode : finalMode;
      const wasSide = effectiveFromMode === 'left' || effectiveFromMode === 'right';
      let nextPlacement: DockPlacement;
      if (target?.kind === 'side' && vw >= 640) {
        setIsInspectorOpen(false);
        setIsDockSettingsOpen(false);
        setIsShortcutsOpen(false);
        setEditingSlot(null);
        setEditingColorSlot(null);
        nextPlacement = { mode: target.side };
      } else {
        nextPlacement = { mode: 'bottom' };
      }

      const willBeSide = nextPlacement.mode === 'left' || nextPlacement.mode === 'right';
      const clampVel = (v: number) => Math.max(-1800, Math.min(1800, v));
      dockPendingVelocityRef.current = {
        vx: clampVel(finalVx * 1000 + shiftVx),
        vy: clampVel(finalVy * 1000 + shiftVy),
      };
      if (pendingAspectMorphRef.current) {
        pendingAspectMorphRef.current.ghostEl?.remove();
        pendingAspectMorphRef.current = null;
      }
      if (wasSide !== willBeSide) {
        dockPendingMorphFromCenterRef.current = {
          cx: finalLeft + finalDims.w * 0.5,
          cy: finalTop + finalDims.h * 0.5,
        };
        pendingAspectMorphRef.current = captureAspectMorphStart(effectiveFromMode, vw, finalDims);
      } else {
        dockPendingMorphFromCenterRef.current = null;
      }
      dockPendingMorphRef.current = wasSide !== willBeSide;
      dockPendingMorphDirectionRef.current =
        wasSide !== willBeSide ? (willBeSide ? 'to-side' : 'to-bottom') : null;
      dockPendingMorphSideRef.current =
        wasSide !== willBeSide
          ? willBeSide
            ? nextPlacement.mode === 'left' || nextPlacement.mode === 'right'
              ? nextPlacement.mode
              : null
            : effectiveFromMode === 'left' || effectiveFromMode === 'right'
            ? effectiveFromMode
            : null
          : null;
      dockPendingMorphSourceRef.current = 'drag';
      dockPendingSpringRef.current = true;
      setDockPlacement(nextPlacement);
    },
    [
      captureAspectMorphStart,
      collapseDockIntoCornerOrb,
      computeDropTarget,
      dockMorphShiftX,
      dockMorphShiftY,
      dockX,
      dockY,
      getDimsForMode,
      stepActiveDrag,
      stopDockShiftOnly,
      unmorphDockFromOrbVisual,
    ]
  );

  const stopTrayMomentum = useCallback(() => {
    if (trayMomentumRafRef.current !== null) {
      window.cancelAnimationFrame(trayMomentumRafRef.current);
      trayMomentumRafRef.current = null;
    }
  }, []);

  const updateNibsScrollEdges = useCallback(() => {
    const vp = nibsViewportRef.current;
    const tray = nibsTrayRef.current;
    if (!vp || !tray) {
      setNibsScrollEdge((prev) => (prev.canStart || prev.canEnd ? { canStart: false, canEnd: false } : prev));
      return;
    }
    const isSide = effectiveDockMode === 'left' || effectiveDockMode === 'right';
    const vpRect = vp.getBoundingClientRect();
    const trayRect = tray.getBoundingClientRect();
    const canStart = isSide ? trayRect.top < vpRect.top - 3 : trayRect.right > vpRect.right + 3;
    const canEnd = isSide ? trayRect.bottom > vpRect.bottom + 3 : trayRect.left < vpRect.left - 3;
    setNibsScrollEdge((prev) =>
      prev.canStart === canStart && prev.canEnd === canEnd ? prev : { canStart, canEnd }
    );
  }, [effectiveDockMode]);

  useEffect(() => {
    if (!isPaletteOpen || isDragging) return;
    // Defer layout reads & state updates cleanly past any active container morph/spring flight
    const delayMs = isAspectMorphingRef.current || isAnimatingDockRef.current ? 320 : 0;
    if (delayMs > 0) {
      const timer = window.setTimeout(() => {
        updateNibsScrollEdges();
      }, delayMs);
      return () => window.clearTimeout(timer);
    }
    const raf = window.requestAnimationFrame(() => {
      updateNibsScrollEdges();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    isPaletteOpen,
    isDragging,
    effectiveDockMode,
    viewportSize,
    systemSettings.enabledOptionalTools,
    updateNibsScrollEdges,
  ]);

  // Smoothly auto-reveal any tool chosen via keyboard shortcut if tucked inside tray
  useEffect(() => {
    if (!isPaletteOpen || isDragging || activeTool === 'cursor' || isAspectMorphingRef.current) return;
    const vp = nibsViewportRef.current;
    if (!vp) return;
    const activeBtn = vp.querySelector<HTMLElement>('.apple-nib-slot.is-active');
    if (!activeBtn) return;

    const raf = window.requestAnimationFrame(() => {
      if (isAspectMorphingRef.current) return;
      const vpRect = vp.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const isSide = effectiveDockMode === 'left' || effectiveDockMode === 'right';
      if (isSide) {
        if (btnRect.top < vpRect.top + 8) {
          vp.scrollBy({ top: btnRect.top - (vpRect.top + 14), behavior: 'smooth' });
        } else if (btnRect.bottom > vpRect.bottom - 8) {
          vp.scrollBy({ top: btnRect.bottom - (vpRect.bottom - 14), behavior: 'smooth' });
        }
      } else {
        if (btnRect.left < vpRect.left + 14) {
          vp.scrollBy({ left: btnRect.left - (vpRect.left + 20), behavior: 'smooth' });
        } else if (btnRect.right > vpRect.right - 14) {
          vp.scrollBy({ left: btnRect.right - (vpRect.right - 20), behavior: 'smooth' });
        }
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeTool, isPaletteOpen, isDragging, effectiveDockMode]);

  const stepNibsTray = useCallback(
    (dir: 'start' | 'end') => {
      const vp = nibsViewportRef.current;
      if (!vp) return;
      stopTrayMomentum();
      const isSide = effectiveDockMode === 'left' || effectiveDockMode === 'right';
      const stepPx = isSide ? 114 : 156;
      if (isSide) {
        vp.scrollBy({ top: dir === 'end' ? stepPx : -stepPx, behavior: 'smooth' });
      } else {
        // RTL horizontal strip: 'end' reveals tucked pens to the left (-x), 'start' returns right (+x)
        vp.scrollBy({ left: dir === 'end' ? -stepPx : stepPx, behavior: 'smooth' });
      }
    },
    [effectiveDockMode, stopTrayMomentum]
  );

  // Window-level pointer tracking with rAF coalescing for silky VSync drag tracking
  useEffect(() => {
    const onWinMove = (e: PointerEvent) => {
      const trayDrag = trayDragRef.current;
      if (trayDrag && trayDrag.pointerId === e.pointerId) {
        const dx = e.clientX - trayDrag.startClientX;
        const dy = e.clientY - trayDrag.startClientY;
        const dist = Math.hypot(dx, dy);

        if (!trayDrag.active) {
          if (dist < 6) return;
          const vpNow = nibsViewportRef.current;
          const atSideScrollLimit =
            trayDrag.isSide &&
            vpNow &&
            ((vpNow.scrollTop <= 1 && dy < -8) ||
              (vpNow.scrollTop + vpNow.clientHeight >= vpNow.scrollHeight - 1 && dy > 8));
          const isPerpendicular = trayDrag.isSide
            ? Math.abs(dx) > Math.abs(dy) * 0.92 || Boolean(atSideScrollLimit)
            : Math.abs(dy) > Math.abs(dx) * 0.95;
          if (isPerpendicular) {
            trayDragRef.current = null;
            setIsTrayDragging(false);
            suppressNextClickRef.current = true;
            beginActiveDrag(
              e.pointerId,
              trayDrag.startClientX,
              trayDrag.startClientY,
              trayDrag.startTime
            );
            stepActiveDrag(e.clientX, e.clientY);
            return;
          }
          trayDrag.active = true;
          suppressNextClickRef.current = true;
          setIsTrayDragging(true);
        }

        const now = performance.now();
        const dt = Math.max(4, now - trayDrag.lastTime);
        const curPos = trayDrag.isSide ? e.clientY : e.clientX;
        const instV = (curPos - trayDrag.lastPos) / dt;
        trayDrag.velocity = 0.45 * instV + 0.55 * trayDrag.velocity;
        trayDrag.lastPos = curPos;
        trayDrag.lastTime = now;

        const vp = nibsViewportRef.current;
        if (vp) {
          if (trayDrag.isSide) {
            vp.scrollTop = trayDrag.startScrollPos - dy;
          } else {
            vp.scrollLeft = trayDrag.startScrollPos - dx;
          }
          updateNibsScrollEdges();
        }
        return;
      }

      const pending = pendingDragRef.current;
      if (pending && pending.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - pending.startClientX, e.clientY - pending.startClientY);
        if (dist >= 8) {
          pendingDragRef.current = null;
          suppressNextClickRef.current = true;
          beginActiveDrag(e.pointerId, pending.startClientX, pending.startClientY, pending.startTime);
          stepActiveDrag(e.clientX, e.clientY);
        }
        return;
      }
      const active = dragStartRef.current;
      if (active && active.pointerId === e.pointerId) {
        dockLatestPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        if (dockMoveRafRef.current === null) {
          dockMoveRafRef.current = window.requestAnimationFrame(() => {
            dockMoveRafRef.current = null;
            const pt = dockLatestPointerRef.current;
            if (pt && dragStartRef.current) {
              stepActiveDrag(pt.clientX, pt.clientY);
            }
          });
        }
      }
    };

    const onWinEnd = (e: PointerEvent) => {
      const trayDrag = trayDragRef.current;
      if (trayDrag && trayDrag.pointerId === e.pointerId) {
        trayDragRef.current = null;
        setIsTrayDragging(false);
        if (trayDrag.active) {
          window.setTimeout(() => {
            suppressNextClickRef.current = false;
          }, 40);
          let v = trayDrag.velocity;
          if (Math.abs(v) > 0.14) {
            let lastT = performance.now();
            const isSide = trayDrag.isSide;
            const stepMomentum = () => {
              const vp = nibsViewportRef.current;
              if (!vp) {
                trayMomentumRafRef.current = null;
                return;
              }
              const nowT = performance.now();
              const dtFrame = Math.min(32, Math.max(4, nowT - lastT));
              lastT = nowT;
              const prevPos = isSide ? vp.scrollTop : vp.scrollLeft;
              if (isSide) {
                vp.scrollTop -= v * dtFrame;
              } else {
                vp.scrollLeft -= v * dtFrame;
              }
              const nextPos = isSide ? vp.scrollTop : vp.scrollLeft;
              updateNibsScrollEdges();
              v *= Math.pow(0.91, dtFrame / 16);
              if (Math.abs(v) < 0.03 || Math.abs(nextPos - prevPos) < 0.05) {
                trayMomentumRafRef.current = null;
                return;
              }
              trayMomentumRafRef.current = window.requestAnimationFrame(stepMomentum);
            };
            stopTrayMomentum();
            trayMomentumRafRef.current = window.requestAnimationFrame(stepMomentum);
          }
        }
        return;
      }

      if (pendingDragRef.current && pendingDragRef.current.pointerId === e.pointerId) {
        pendingDragRef.current = null;
      }
      if (dragStartRef.current && dragStartRef.current.pointerId === e.pointerId) {
        finishActiveDrag(e.clientX, e.clientY);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 40);
      }
    };

    const onWinBlur = () => {
      trayDragRef.current = null;
      setIsTrayDragging(false);
      stopTrayMomentum();
      pendingDragRef.current = null;
      const active = dragStartRef.current;
      if (active) {
        finishActiveDrag(active.lastClientX, active.lastClientY);
        suppressNextClickRef.current = false;
      }
    };

    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinEnd);
    window.addEventListener('pointercancel', onWinEnd);
    window.addEventListener('blur', onWinBlur);
    return () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinEnd);
      window.removeEventListener('pointercancel', onWinEnd);
      window.removeEventListener('blur', onWinBlur);
    };
  }, [beginActiveDrag, finishActiveDrag, stepActiveDrag, stopTrayMomentum, updateNibsScrollEdges]);

  // Global custom events for Shift+D (cycle dock station) & ? (shortcuts help guide)
  useEffect(() => {
    const onToggleShortcuts = () => {
      if (!isPaletteOpen) {
        openPaletteFromOrb();
        setIsInspectorOpen(false);
        setIsDockSettingsOpen(false);
        setEditingSlot(null);
        setEditingColorSlot(null);
        setIsShortcutsOpen(true);
        emitShortcutFeedback('دليل الاختصارات', '?');
        return;
      }
      setIsInspectorOpen(false);
      setIsDockSettingsOpen(false);
      setEditingSlot(null);
      setEditingColorSlot(null);
      setIsShortcutsOpen((prev) => {
        const next = !prev;
        emitShortcutFeedback(next ? 'دليل الاختصارات' : 'إغلاق دليل الاختصارات', '?');
        return next;
      });
    };

    const onCyclePlacement = () => {
      const { vw } = getLayoutViewport();
      if (vw < 640) {
        if (!isPaletteOpen) openPaletteFromOrb();
        snapDockToPreset('bottom');
        emitShortcutFeedback('موضع الشريط: أسفل', 'Shift+D');
        return;
      }
      const cur = dockPlacementRef.current.mode;
      const next: DockPlacement['mode'] =
        cur === 'bottom' ? 'right' : cur === 'right' ? 'left' : 'bottom';
      if (!isPaletteOpen) {
        dockWasCollapsedIntoOrbRef.current = false;
        const halfOrb = getOrbCornerMargins(vw).orbSize * 0.5;
        dockOpeningFromOrbRef.current = {
          cx: orbX.get() + halfOrb,
          cy: orbY.get() + halfOrb,
        };
        setPaletteOpen(true);
      }
      snapDockToPreset(next);
      emitShortcutFeedback(
        next === 'bottom' ? 'موضع الشريط: أسفل' : next === 'right' ? 'موضع الشريط: يمين' : 'موضع الشريط: يسار',
        'Shift+D'
      );
    };

    const onAutoMinimizeOnDraw = () => {
      if (!systemSettings.autoMinimizeWhileDrawing || !isPaletteOpen) return;
      if (
        dragStartRef.current ||
        isInspectorOpen ||
        isDockSettingsOpen ||
        isShortcutsOpen ||
        editingSlot !== null ||
        editingColorSlot !== null
      ) {
        return;
      }
      if (typeof window !== 'undefined') {
        const { vw, vh } = getLayoutViewport();
        const mode = dockPlacementRef.current.mode;
        const dims = getDimsForMode(mode, vw, vh);
        const targetSide: 'left' | 'right' =
          mode === 'left' ? 'left' : mode === 'right' ? 'right' : orbPosRef.current.side;
        collapseDockIntoCornerOrb({
          targetSide,
          dims,
          orbCxOnDock: dockX.get() + dims.w * 0.5,
          orbCyOnDock: dockY.get() + dims.h * 0.5,
          vw,
          vh,
          fromDrag: false,
        });
        return;
      }
      setPaletteOpen(false);
    };

    const onTogglePaletteShortcut = (event: Event) => {
      const customEv = event as CustomEvent<{ nextOpen?: boolean }>;
      const nextOpen =
        typeof customEv.detail?.nextOpen === 'boolean' ? customEv.detail.nextOpen : !isPaletteOpen;
      event.preventDefault();
      if (nextOpen) {
        openPaletteFromOrb();
        return;
      }
      if (typeof window !== 'undefined') {
        const { vw, vh } = getLayoutViewport();
        const mode = dockPlacementRef.current.mode;
        const dims = getDimsForMode(mode, vw, vh);
        const targetSide: 'left' | 'right' =
          mode === 'left' ? 'left' : mode === 'right' ? 'right' : orbPosRef.current.side;
        collapseDockIntoCornerOrb({
          targetSide,
          dims,
          orbCxOnDock: dockX.get() + dims.w * 0.5,
          orbCyOnDock: dockY.get() + dims.h * 0.5,
          vw,
          vh,
          fromDrag: false,
        });
        return;
      }
      setPaletteOpen(false);
    };

    window.addEventListener('safara:toggle-shortcuts-help', onToggleShortcuts);
    window.addEventListener('safara:cycle-dock-placement', onCyclePlacement);
    window.addEventListener('safara:annotation-stroke-start', onAutoMinimizeOnDraw);
    window.addEventListener('safara:toggle-palette-shortcut', onTogglePaletteShortcut);
    return () => {
      window.removeEventListener('safara:toggle-shortcuts-help', onToggleShortcuts);
      window.removeEventListener('safara:cycle-dock-placement', onCyclePlacement);
      window.removeEventListener('safara:annotation-stroke-start', onAutoMinimizeOnDraw);
      window.removeEventListener('safara:toggle-palette-shortcut', onTogglePaletteShortcut);
    };
  }, [
    collapseDockIntoCornerOrb,
    dockX,
    dockY,
    editingColorSlot,
    editingSlot,
    emitShortcutFeedback,
    getDimsForMode,
    isDockSettingsOpen,
    isInspectorOpen,
    isPaletteOpen,
    isShortcutsOpen,
    openPaletteFromOrb,
    setPaletteOpen,
    snapDockToPreset,
    systemSettings.autoMinimizeWhileDrawing,
  ]);

  const handleDragStart = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    suppressNextClickRef.current = false;
    pendingDragRef.current = null;
    beginActiveDrag(e.pointerId, e.clientX, e.clientY);
  };

  const handleNibsViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const vp = nibsViewportRef.current;
    if (!vp) return;
    const modeNow = liveDragMode ?? dockPlacementRef.current.mode;
    const isSide = modeNow === 'left' || modeNow === 'right';
    const isScrollable = isSide
      ? vp.scrollHeight > vp.clientHeight + 4
      : vp.scrollWidth > vp.clientWidth + 4;
    if (!isScrollable) return;

    e.stopPropagation();
    suppressNextClickRef.current = false;
    pendingDragRef.current = null;
    stopTrayMomentum();

    const now = performance.now();
    trayDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollPos: isSide ? vp.scrollTop : vp.scrollLeft,
      startTime: now,
      lastPos: isSide ? e.clientY : e.clientX,
      lastTime: now,
      velocity: 0,
      isSide,
      active: false,
    };
  };

  const handleNibsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const vp = nibsViewportRef.current;
    if (!vp) return;
    const modeNow = liveDragMode ?? dockPlacementRef.current.mode;
    const isSide = modeNow === 'left' || modeNow === 'right';
    const isScrollable = isSide
      ? vp.scrollHeight > vp.clientHeight + 4
      : vp.scrollWidth > vp.clientWidth + 4;
    if (!isScrollable) return;

    const useX = !isSide && Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const delta = useX ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 0.5) return;

    e.preventDefault();
    e.stopPropagation();
    stopTrayMomentum();
    if (isSide) {
      vp.scrollTop += delta;
    } else if (useX) {
      vp.scrollLeft += delta;
    } else {
      // In RTL bottom dock, wheel-down scrolls toward tucked tools on the left
      vp.scrollLeft -= delta;
    }
    updateNibsScrollEdges();
  };

  const handleDockPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    suppressNextClickRef.current = false;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, a, [role="slider"], [role="switch"], .apple-inspector-anchor, .apple-slot-editor-anchor, .apple-color-editor-anchor, .apple-dock-settings-popover, .apple-shortcuts-popover'
      )
    ) {
      return;
    }
    if (target?.closest('.apple-dock-drag-handle')) {
      return;
    }
    // Allow grabbing & dragging from ANYWHERE on the pill bar once movement exceeds 8px;
    // normal clicks/taps (< 8px) still activate pens & tools untouched!
    if (target?.closest('button')) {
      pendingDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTime: performance.now(),
      };
      return;
    }
    handleDragStart(e);
  };

  const handleOrbPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    stopOrbMotion();
    orbPendingSpringRef.current = false;
    orbLatestPointerRef.current = null;
    orbDragMagnetRef.current = null;
    setOrbDragMagnet(null);
    setOrbDragTarget(null);
    if (orbMoveRafRef.current !== null) {
      window.cancelAnimationFrame(orbMoveRafRef.current);
      orbMoveRafRef.current = null;
    }
    if (typeof document !== 'undefined') {
      document.body.classList.add('is-palette-dragging');
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic capture errors
    }
    orbDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: orbX.get(),
      startTop: orbY.get(),
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      lastTime: performance.now(),
      vx: 0,
      vy: 0,
      moved: false,
    };
  };

  const stepOrbDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = orbDragRef.current;
      if (!drag) return;
      const now = performance.now();
      const dt = Math.max(4, now - drag.lastTime);
      const instVx = (clientX - drag.lastClientX) / dt;
      const instVy = (clientY - drag.lastClientY) / dt;
      drag.vx = 0.38 * instVx + 0.62 * drag.vx;
      drag.vy = 0.38 * instVy + 0.62 * drag.vy;
      drag.lastClientX = clientX;
      drag.lastClientY = clientY;
      drag.lastTime = now;

      const rawDx = clientX - drag.startClientX;
      const rawDy = clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(rawDx, rawDy) < 10) return;
      if (!drag.moved) {
        drag.moved = true;
        setIsOrbDragging(true);
      }

      const { vw, vh } = getLayoutViewport();
      const { orbSize } = getOrbCornerMargins(vw);
      const maxLeft = Math.max(10, vw - orbSize - 10);
      const maxTop = Math.max(14, vh - orbSize - 14);
      const rawLeft = drag.startLeft + rawDx;
      const rawTop = drag.startTop + rawDy;
      const rubberLeft = rubberBandClamp(rawLeft, 10, maxLeft, 12);
      const rubberTop = rubberBandClamp(rawTop, 14, maxTop, 12);
      const rawCenterX = rubberLeft + orbSize * 0.5;
      const rawCenterY = rubberTop + orbSize * 0.5;

      const magnetSide = detectCornerMagnet(
        rawCenterX,
        rawCenterY,
        vw,
        vh,
        orbDragMagnetRef.current
      );
      orbDragMagnetRef.current = magnetSide;
      setOrbDragMagnet((prev) => (prev === magnetSide ? prev : magnetSide));

      if (magnetSide !== null) {
        const cornerCoords = resolveOrbCoords({ side: magnetSide }, vw, vh);
        const visualLeft = rubberLeft + (cornerCoords.left - rubberLeft) * 0.52;
        const visualTop = rubberTop + (cornerCoords.top - rubberTop) * 0.52;
        orbX.set(visualLeft);
        orbY.set(visualTop);
        setOrbDragTarget((prev) => (prev !== null ? null : prev));
        return;
      }

      orbX.set(rubberLeft);
      orbY.set(rubberTop);

      const nx = rawCenterX / Math.max(1, vw);
      const ny = rawCenterY / Math.max(1, vh);
      const nextTarget: 'bottom' | 'left' | 'right' =
        vw >= 640 && nx <= 0.24 && ny < 0.8
          ? 'left'
          : vw >= 640 && nx >= 0.76 && ny < 0.8
          ? 'right'
          : 'bottom';
      setOrbDragTarget((prev) => (prev === nextTarget ? prev : nextTarget));
    },
    [orbX, orbY]
  );

  const openBarFromDraggedOrb = useCallback(
    (rawLeft: number, rawTop: number) => {
      const { vw, vh } = getLayoutViewport();
      const { orbSize } = getOrbCornerMargins(vw);
      const clamped = clampOrbCoords(rawLeft, rawTop, vw, vh);
      const centerX = clamped.left + orbSize * 0.5;
      const centerY = clamped.top + orbSize * 0.5;
      const nx = centerX / Math.max(1, vw);
      const ny = centerY / Math.max(1, vh);
      let nextMode: DockPlacement['mode'] = 'bottom';
      if (vw >= 640) {
        if (nx <= 0.24 && ny < 0.8) {
          nextMode = 'left';
        } else if (nx >= 0.76 && ny < 0.8) {
          nextMode = 'right';
        }
      }
      const nextOrbSide: 'left' | 'right' =
        nextMode === 'left' || nextMode === 'right'
          ? nextMode
          : centerX < vw * 0.5
          ? 'left'
          : 'right';

      dockWasCollapsedIntoOrbRef.current = false;
      dockCollapsedFromDragRef.current = false;
      dockCollapseDeltaRef.current = { dx: 0, dy: 0 };
      dockOpeningFromOrbRef.current = { cx: centerX, cy: centerY };
      setOrbPos({ side: nextOrbSide });
      setDockPlacement({ mode: nextMode });
      setPaletteOpen(true);
    },
    [setPaletteOpen]
  );

  const finishOrbDrag = useCallback(
    (clientX: number, clientY: number, pointerId?: number) => {
      if (orbMoveRafRef.current !== null) {
        window.cancelAnimationFrame(orbMoveRafRef.current);
        orbMoveRafRef.current = null;
      }
      orbLatestPointerRef.current = null;

      const drag = orbDragRef.current;
      if (!drag) return;
      if (pointerId !== undefined && drag.pointerId !== pointerId) return;

      stepOrbDrag(clientX, clientY);
      const rawLeft = drag.startLeft + (clientX - drag.startClientX);
      const rawTop = drag.startTop + (clientY - drag.startClientY);
      const activeMagnet = orbDragMagnetRef.current;
      orbDragRef.current = null;
      orbDragMagnetRef.current = null;
      if (typeof document !== 'undefined') {
        document.body.classList.remove('is-palette-dragging');
      }
      try {
        if (orbBtnRef.current?.hasPointerCapture(drag.pointerId)) {
          orbBtnRef.current.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      setIsOrbDragging(false);
      setOrbDragTarget(null);
      setOrbDragMagnet(null);

      if (!drag.moved) {
        openPaletteFromOrb();
        return;
      }

      const { vw, vh } = getLayoutViewport();
      const { orbSize } = getOrbCornerMargins(vw);
      const clamped = clampOrbCoords(rawLeft, rawTop, vw, vh);
      const magnetSide =
        detectCornerMagnet(
          clamped.left + orbSize * 0.5,
          clamped.top + orbSize * 0.5,
          vw,
          vh,
          activeMagnet
        ) ?? activeMagnet;

      if (magnetSide !== null) {
        const clampVel = (v: number) => Math.max(-1600, Math.min(1600, v));
        orbPendingVelocityRef.current = {
          vx: clampVel(drag.vx * 1000),
          vy: clampVel(drag.vy * 1000),
        };
        orbPendingSpringRef.current = true;
        setOrbPos({ side: magnetSide });
        return;
      }

      openBarFromDraggedOrb(rawLeft, rawTop);
    },
    [openBarFromDraggedOrb, openPaletteFromOrb, stepOrbDrag]
  );

  // Window-level orb drag tracking so crossing over reading iframes or losing pointer capture never leaves the orb stuck
  useEffect(() => {
    if (isPaletteOpen) return;

    const onOrbWinMove = (e: PointerEvent) => {
      const drag = orbDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      orbLatestPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (orbMoveRafRef.current === null) {
        orbMoveRafRef.current = window.requestAnimationFrame(() => {
          orbMoveRafRef.current = null;
          const pt = orbLatestPointerRef.current;
          if (pt && orbDragRef.current) {
            stepOrbDrag(pt.clientX, pt.clientY);
          }
        });
      }
    };

    const onOrbWinEnd = (e: PointerEvent) => {
      const drag = orbDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      finishOrbDrag(e.clientX, e.clientY, e.pointerId);
    };

    const onOrbBlur = () => {
      const drag = orbDragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        orbDragRef.current = null;
        orbDragMagnetRef.current = null;
        if (typeof document !== 'undefined') {
          document.body.classList.remove('is-palette-dragging');
        }
        setIsOrbDragging(false);
        setOrbDragTarget(null);
        setOrbDragMagnet(null);
        return;
      }
      finishOrbDrag(drag.lastClientX, drag.lastClientY);
    };

    window.addEventListener('pointermove', onOrbWinMove);
    window.addEventListener('pointerup', onOrbWinEnd);
    window.addEventListener('pointercancel', onOrbWinEnd);
    window.addEventListener('blur', onOrbBlur);
    return () => {
      window.removeEventListener('pointermove', onOrbWinMove);
      window.removeEventListener('pointerup', onOrbWinEnd);
      window.removeEventListener('pointercancel', onOrbWinEnd);
      window.removeEventListener('blur', onOrbBlur);
    };
  }, [isPaletteOpen, finishOrbDrag, stepOrbDrag]);

  const penSizeLevel = pxToSizeLevel('pen', penSettings.size);
  const fountainSizeLevel = pxToSizeLevel('fountain', fountainSettings.size);
  const pencilSizeLevel = pxToSizeLevel('pencil', pencilSettings.size);
  const highlighterSizeLevel = pxToSizeLevel('highlighter', highlighterSettings.size);
  const tapeSizeLevel = pxToSizeLevel('tape', tapeSettings.size);
  const eraserSizeLevel = pxToSizeLevel('eraser', eraserSettings.size);

  // External 3-slot thickness dots adapt to all sizable tools (or stay ready in standby on Browse / Lasso / Laser)
  const rollerTool: SizableAnnotationTool =
    activeTool === 'cursor' || activeTool === 'lasso' || activeTool === 'laser'
      ? lastSizableTool
      : activeTool;

  const currentSlots: [number, number, number] =
    rollerTool === 'pen'
      ? penSettings.sizeSlots
      : rollerTool === 'fountain'
      ? fountainSettings.sizeSlots
      : rollerTool === 'pencil'
      ? pencilSettings.sizeSlots
      : rollerTool === 'highlighter'
      ? highlighterSettings.sizeSlots
      : rollerTool === 'tape'
      ? tapeSettings.sizeSlots
      : eraserSettings.sizeSlots;

  const currentActiveSlot: SizeSlotIndex =
    rollerTool === 'pen'
      ? penSettings.activeSizeSlot
      : rollerTool === 'fountain'
      ? fountainSettings.activeSizeSlot
      : rollerTool === 'pencil'
      ? pencilSettings.activeSizeSlot
      : rollerTool === 'highlighter'
      ? highlighterSettings.activeSizeSlot
      : rollerTool === 'tape'
      ? tapeSettings.activeSizeSlot
      : eraserSettings.activeSizeSlot;

  const rollerColor =
    rollerTool === 'pen'
      ? penSettings.color
      : rollerTool === 'fountain'
      ? fountainSettings.color
      : rollerTool === 'pencil'
      ? pencilSettings.color
      : rollerTool === 'highlighter'
      ? highlighterSettings.color
      : rollerTool === 'tape'
      ? tapeSettings.color
      : eraserSettings.highlighterOnly
      ? '#F59E0B'
      : '#EC4899';

  const handleSelectSizeSlot = useCallback(
    (slot: SizeSlotIndex) => {
      if (rollerTool === 'pen') {
        updatePenSettings({ activeSizeSlot: slot });
      } else if (rollerTool === 'fountain') {
        updateFountainSettings({ activeSizeSlot: slot });
      } else if (rollerTool === 'pencil') {
        updatePencilSettings({ activeSizeSlot: slot });
      } else if (rollerTool === 'highlighter') {
        updateHighlighterSettings({ activeSizeSlot: slot });
      } else if (rollerTool === 'tape') {
        updateTapeSettings({ activeSizeSlot: slot });
      } else {
        updateEraserSettings({ activeSizeSlot: slot });
      }
    },
    [
      rollerTool,
      updatePenSettings,
      updateFountainSettings,
      updatePencilSettings,
      updateHighlighterSettings,
      updateTapeSettings,
      updateEraserSettings,
    ]
  );

  const handleChangeSlotLevel = useCallback(
    (slot: SizeSlotIndex, lvl: number) => {
      const nextPx = sizeLevelToPx(rollerTool, lvl);
      const applyPatch = (slots: [number, number, number]): [number, number, number] => {
        const copy: [number, number, number] = [slots[0], slots[1], slots[2]];
        copy[slot] = nextPx;
        return copy;
      };
      if (rollerTool === 'pen') {
        updatePenSettings({ sizeSlots: applyPatch(penSettings.sizeSlots) });
      } else if (rollerTool === 'fountain') {
        updateFountainSettings({ sizeSlots: applyPatch(fountainSettings.sizeSlots) });
      } else if (rollerTool === 'pencil') {
        updatePencilSettings({ sizeSlots: applyPatch(pencilSettings.sizeSlots) });
      } else if (rollerTool === 'highlighter') {
        updateHighlighterSettings({ sizeSlots: applyPatch(highlighterSettings.sizeSlots) });
      } else if (rollerTool === 'tape') {
        updateTapeSettings({ sizeSlots: applyPatch(tapeSettings.sizeSlots) });
      } else {
        updateEraserSettings({ sizeSlots: applyPatch(eraserSettings.sizeSlots) });
      }
    },
    [
      rollerTool,
      penSettings.sizeSlots,
      fountainSettings.sizeSlots,
      pencilSettings.sizeSlots,
      highlighterSettings.sizeSlots,
      tapeSettings.sizeSlots,
      eraserSettings.sizeSlots,
      updatePenSettings,
      updateFountainSettings,
      updatePencilSettings,
      updateHighlighterSettings,
      updateTapeSettings,
      updateEraserSettings,
    ]
  );

  const colorTool: ColorableAnnotationTool =
    activeTool !== 'cursor' && activeTool !== 'lasso' && activeTool !== 'eraser'
      ? activeTool
      : lastColorableTool;

  const currentColorSlots: [string, string, string] =
    colorTool === 'pen'
      ? penSettings.colorSlots
      : colorTool === 'fountain'
      ? fountainSettings.colorSlots
      : colorTool === 'pencil'
      ? pencilSettings.colorSlots
      : colorTool === 'highlighter'
      ? highlighterSettings.colorSlots
      : colorTool === 'tape'
      ? tapeSettings.colorSlots
      : laserSettings.colorSlots;

  const currentActiveColorSlot: ColorSlotIndex =
    colorTool === 'pen'
      ? penSettings.activeColorSlot
      : colorTool === 'fountain'
      ? fountainSettings.activeColorSlot
      : colorTool === 'pencil'
      ? pencilSettings.activeColorSlot
      : colorTool === 'highlighter'
      ? highlighterSettings.activeColorSlot
      : colorTool === 'tape'
      ? tapeSettings.activeColorSlot
      : laserSettings.activeColorSlot;

  const currentColorPalette: readonly ColorSwatch[] =
    colorTool === 'highlighter'
      ? APPLE_HIGHLIGHTER_COLORS
      : colorTool === 'pencil'
      ? APPLE_PENCIL_COLORS
      : colorTool === 'tape'
      ? APPLE_TAPE_COLORS
      : colorTool === 'laser'
      ? APPLE_LASER_COLORS
      : APPLE_PEN_COLORS;

  const handleSelectColorSlot = useCallback(
    (slot: ColorSlotIndex) => {
      if (colorTool === 'pen') {
        updatePenSettings({ activeColorSlot: slot });
      } else if (colorTool === 'fountain') {
        updateFountainSettings({ activeColorSlot: slot });
      } else if (colorTool === 'pencil') {
        updatePencilSettings({ activeColorSlot: slot });
      } else if (colorTool === 'highlighter') {
        updateHighlighterSettings({ activeColorSlot: slot });
      } else if (colorTool === 'tape') {
        updateTapeSettings({ activeColorSlot: slot });
      } else {
        updateLaserSettings({ activeColorSlot: slot });
      }
    },
    [
      colorTool,
      updatePenSettings,
      updateFountainSettings,
      updatePencilSettings,
      updateHighlighterSettings,
      updateTapeSettings,
      updateLaserSettings,
    ]
  );

  const handleChangeSlotColor = useCallback(
    (slot: ColorSlotIndex, hex: string) => {
      const applyPatch = (slots: [string, string, string]): [string, string, string] => {
        const copy: [string, string, string] = [slots[0], slots[1], slots[2]];
        copy[slot] = hex;
        return copy;
      };
      if (colorTool === 'pen') {
        updatePenSettings({ colorSlots: applyPatch(penSettings.colorSlots) });
      } else if (colorTool === 'fountain') {
        updateFountainSettings({ colorSlots: applyPatch(fountainSettings.colorSlots) });
      } else if (colorTool === 'pencil') {
        updatePencilSettings({ colorSlots: applyPatch(pencilSettings.colorSlots) });
      } else if (colorTool === 'highlighter') {
        updateHighlighterSettings({ colorSlots: applyPatch(highlighterSettings.colorSlots) });
      } else if (colorTool === 'tape') {
        updateTapeSettings({ colorSlots: applyPatch(tapeSettings.colorSlots) });
      } else {
        updateLaserSettings({ colorSlots: applyPatch(laserSettings.colorSlots) });
      }
    },
    [
      colorTool,
      penSettings.colorSlots,
      fountainSettings.colorSlots,
      pencilSettings.colorSlots,
      highlighterSettings.colorSlots,
      tapeSettings.colorSlots,
      laserSettings.colorSlots,
      updatePenSettings,
      updateFountainSettings,
      updatePencilSettings,
      updateHighlighterSettings,
      updateTapeSettings,
      updateLaserSettings,
    ]
  );

  const hasOpenPopover =
    isPaletteOpen &&
    (isInspectorOpen ||
      isDockSettingsOpen ||
      isShortcutsOpen ||
      editingSlot !== null ||
      editingColorSlot !== null);

  const anyPopoverOpen = hasOpenPopover || isSelectedPropsOpen;

  const previewStrokeWidth = Math.max(1.5, Math.min(10.5, penSettings.size * 0.8));
  const previewDashArray =
    penSettings.lineStyle === 'dashed'
      ? `${(previewStrokeWidth * 2.5).toFixed(1)} ${(previewStrokeWidth * 1.9).toFixed(1)}`
      : penSettings.lineStyle === 'dotted'
      ? `0.1 ${(previewStrokeWidth * 2.15).toFixed(1)}`
      : undefined;

  const selectedQuickColors =
    selectedStrokeAnchor?.kind === 'highlighter'
      ? highlighterSettings.colorSlots
      : selectedStrokeAnchor?.kind === 'fountain'
      ? fountainSettings.colorSlots
      : selectedStrokeAnchor?.kind === 'pencil'
      ? pencilSettings.colorSlots
      : selectedStrokeAnchor?.kind === 'tape'
      ? tapeSettings.colorSlots
      : penSettings.colorSlots;

  const selectedBarCoords = (() => {
    if (!selectedStrokeAnchor || typeof window === 'undefined') return null;
    const { vw, vh } = getLayoutViewport();
    const minLeft = 148;
    const maxLeft = Math.max(minLeft, vw - 148);
    const left = Math.max(minLeft, Math.min(maxLeft, selectedStrokeAnchor.centerX));
    const placeBelow = selectedStrokeAnchor.topY < 86;
    const rawTop = placeBelow
      ? selectedStrokeAnchor.bottomY + 10
      : selectedStrokeAnchor.topY - 10;
    const bottomSafe = isPaletteOpen && dockPlacement.mode === 'bottom' ? 104 : 64;
    const top = Math.max(20, Math.min(vh - bottomSafe, rawTop));
    return { left, top, placeBelow };
  })();

  const selectedTargetIds = selectedStrokeAnchor
    ? selectedStrokeAnchor.strokeIds && selectedStrokeAnchor.strokeIds.length > 0
      ? selectedStrokeAnchor.strokeIds
      : [selectedStrokeAnchor.strokeId]
    : [];
  const selectedCount = selectedStrokeAnchor?.count ?? selectedTargetIds.length;
  const primarySelStroke = selectedStrokeObjects[0] ?? null;
  const hasSelectedPen = selectedStrokeObjects.some((s) => s.kind === 'pen');
  const hasSelectedFountain = selectedStrokeObjects.some((s) => s.kind === 'fountain');
  const hasSelectedTape = selectedStrokeObjects.some((s) => s.kind === 'tape');
  const hasSelectedShape = selectedStrokeObjects.some((s) => Boolean(s.shape));
  const selectedSizeLevel = primarySelStroke
    ? pxToSizeLevel(primarySelStroke.kind, primarySelStroke.size)
    : 20;
  const selectedOpacityPct = primarySelStroke
    ? Math.max(20, Math.min(100, Math.round(primarySelStroke.opacity * 100)))
    : 100;

  const stepSelectedThickness = (deltaLevel: number) => {
    if (!selectedStrokeAnchor || selectedTargetIds.length === 0) return;
    updateStrokesBatch(
      selectedStrokeAnchor.surfaceId,
      selectedTargetIds,
      (st) => {
        const curLvl = pxToSizeLevel(st.kind, st.size);
        const nextLvl = clampSizeLevel(curLvl + deltaLevel);
        return { ...st, size: sizeLevelToPx(st.kind, nextLvl) };
      },
      true
    );
  };

  const flattenSelectedShapes = () => {
    if (!selectedStrokeAnchor || selectedTargetIds.length === 0) return;
    const surfEl = document.querySelector<HTMLElement>(
      `[data-surface-id="${selectedStrokeAnchor.surfaceId}"]`
    );
    const rect = surfEl?.getBoundingClientRect();
    const tf: RenderTransform =
      rect && rect.width > 0 && rect.height > 0
        ? {
            scaleX: rect.width / 1000,
            scaleY: rect.height / 1000,
            offsetX: 0,
            offsetY: 0,
            unitScale: ((rect.width / 1000 + rect.height / 1000) * 0.5) || 1,
          }
        : { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, unitScale: 1 };
    updateStrokesBatch(
      selectedStrokeAnchor.surfaceId,
      selectedTargetIds,
      (st) => {
        if (!st.shape) return st;
        return {
          ...st,
          shape: undefined,
          points: flattenShapeToFreehandPoints(st, tf),
        };
      },
      true
    );
    setIsSelectedPropsOpen(false);
  };

  const isDockInTopHalf = false;
  const isSideTop = false;

  const popoverAxisOffset =
    effectiveDockMode === 'left'
      ? { x: -6, y: 0 }
      : effectiveDockMode === 'right'
      ? { x: 6, y: 0 }
      : { x: 0, y: 6 };

  const orbOriginDirX = orbPos.side === 'left' ? -16 : 16;
  const orbOriginDirY = 14;

  const dockLaunchInitial = { opacity: 0.35, x: 0, y: 0, scale: 1 };

  const dockLaunchExit =
    effectiveDockMode === 'left'
      ? { opacity: 0, x: -12, y: 0, scale: 0.72, transition: { duration: 0.16, ease: APPLE_IPAD_EASE } }
      : effectiveDockMode === 'right'
      ? { opacity: 0, x: 12, y: 0, scale: 0.72, transition: { duration: 0.16, ease: APPLE_IPAD_EASE } }
      : {
          opacity: 0,
          x: orbOriginDirX * 0.35,
          y: orbOriginDirY * 0.5,
          scale: 0.72,
          transition: { duration: 0.16, ease: APPLE_IPAD_EASE },
        };

  const dockAnchorVariants = {
    exit: () =>
      dockWasCollapsedIntoOrbRef.current
        ? {
            opacity: 1,
            pointerEvents: 'none' as const,
            transition: { duration: Math.max(0.24, dockCollapseFlightSecRef.current + 0.05) },
          }
        : { opacity: 1, pointerEvents: 'none' as const, transition: { duration: 0.16 } },
  };

  const dockMotionShellVariants = {
    initial: dockLaunchInitial,
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        opacity: { duration: 0.13, ease: APPLE_IPAD_EASE },
        default: APPLE_DOCK_SPRING,
      },
    },
    exit: () => {
      if (dockWasCollapsedIntoOrbRef.current) {
        const { dx, dy } = dockCollapseDeltaRef.current;
        const flyDuration = dockCollapseFlightSecRef.current || 0.19;
        return {
          x: dx,
          y: dy,
          scale: 1,
          opacity: 0,
          transition: {
            x: { duration: flyDuration, ease: APPLE_CALM_EASE },
            y: { duration: flyDuration, ease: APPLE_CALM_EASE },
            scale: { duration: flyDuration, ease: APPLE_CALM_EASE },
            opacity: { duration: 0.025, delay: flyDuration - 0.005, ease: 'linear' as const },
          },
        };
      }
      return dockLaunchExit;
    },
  };

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="apple-annotation-portal"
      data-annotation-ui="true"
      data-annotation-popover-open={anyPopoverOpen ? 'true' : undefined}
      dir="rtl"
    >
      {/* Floating Quick-Action Mini-Bar above/below any selected stroke, shape, or lasso group */}
      <AnimatePresence>
        {selectedStrokeAnchor && selectedBarCoords && (
          <div
            key={selectedTargetIds.join(',')}
            ref={selectedBarRef}
            className={`apple-selected-stroke-anchor ${selectedBarCoords.placeBelow ? 'is-below' : 'is-above'}`}
            style={{
              left: `${Math.round(selectedBarCoords.left)}px`,
              top: `${Math.round(selectedBarCoords.top)}px`,
            }}
          >
          <motion.div
            className="apple-selected-stroke-bar"
            role="toolbar"
            aria-label="إجراءات العنصر المحدد"
            initial={{ opacity: 0, y: selectedBarCoords.placeBelow ? -4 : 4, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: APPLE_POPOVER_SPRING,
            }}
            exit={{
              opacity: 0,
              y: selectedBarCoords.placeBelow ? -3 : 3,
              scale: 0.98,
              transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
            }}
          >
            {selectedCount > 1 && (
              <>
                <span className="apple-selected-bar-count" title="عدد العناصر المحددة">
                  {toArabicDigits(selectedCount)}
                </span>
                <span className="apple-selected-bar-sep" aria-hidden="true" />
              </>
            )}

            <div className="apple-selected-bar-colors">
              {selectedQuickColors.map((hex, idx) => (
                <button
                  key={`${hex}-${idx}`}
                  type="button"
                  className="apple-selected-bar-dot"
                  style={{ '--dot-hex': hex } as React.CSSProperties}
                  aria-label="تغيير اللون"
                  title="تبديل لون العنصر المحدد"
                  onClick={() =>
                    updateStrokesBatch(
                      selectedStrokeAnchor.surfaceId,
                      selectedTargetIds,
                      (st) => ({ ...st, color: hex }),
                      true
                    )
                  }
                />
              ))}
            </div>

            <span className="apple-selected-bar-sep" aria-hidden="true" />

            <button
              type="button"
              className="apple-selected-bar-btn"
              title="تنحيف السُمك"
              aria-label="تنحيف السُمك"
              onClick={() => stepSelectedThickness(-10)}
            >
              <Minus className="w-3.5 h-3.5" strokeWidth={2.1} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="apple-selected-bar-btn"
              title="زيادة السُمك"
              aria-label="زيادة السُمك"
              onClick={() => stepSelectedThickness(10)}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.1} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`apple-selected-bar-btn ${isSelectedPropsOpen ? 'is-active' : ''}`}
              title="خصائص إضافية (السُمك، الشفافية، الترتيب)"
              aria-label="خصائص العنصر المحدد"
              aria-expanded={isSelectedPropsOpen}
              onClick={() => setIsSelectedPropsOpen((prev) => !prev)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.95} aria-hidden="true" />
            </button>

            <span className="apple-selected-bar-sep" aria-hidden="true" />

            <button
              type="button"
              className="apple-selected-bar-btn"
              title="تكرار (Ctrl+D)"
              aria-label="تكرار المحدد"
              onClick={() =>
                duplicateStrokes(selectedStrokeAnchor.surfaceId, selectedTargetIds)
              }
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.9} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="apple-selected-bar-btn is-danger"
              title="حذف (Delete)"
              aria-label="حذف المحدد"
              onClick={() =>
                removeStrokes(selectedStrokeAnchor.surfaceId, selectedTargetIds)
              }
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.9} aria-hidden="true" />
            </button>

            <div
              className={`apple-selected-props-anchor ${
                selectedBarCoords.placeBelow ? 'is-below' : 'is-above'
              }`}
            >
              <AnimatePresence>
                {isSelectedPropsOpen && primarySelStroke && (
                  <motion.div
                    className="apple-selected-props-popover"
                    role="dialog"
                    aria-label="خصائص العناصر المحددة"
                    initial={{ opacity: 0, y: selectedBarCoords.placeBelow ? -4 : 4, scale: 0.97 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: APPLE_POPOVER_SPRING,
                    }}
                    exit={{
                      opacity: 0,
                      y: selectedBarCoords.placeBelow ? -3 : 3,
                      scale: 0.98,
                      transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
                    }}
                  >
                  <div className="apple-inspector-section">
                    <div className="apple-slider-head">
                      <span>السُمك</span>
                      <span className="apple-slider-val">{toArabicDigits(selectedSizeLevel)}٪</span>
                    </div>
                    <CalmMagneticSlider
                      value={selectedSizeLevel}
                      min={SIZE_DIAL_MIN}
                      max={SIZE_DIAL_MAX}
                      step={SIZE_DIAL_STEP}
                      magnetStep={5}
                      ariaLabel="سُمك العناصر المحددة"
                      onInteractionStart={() => {
                        selectedSliderDraggingRef.current = true;
                        selectedSliderDirtyRef.current = false;
                      }}
                      onInteractionEnd={() => {
                        selectedSliderDraggingRef.current = false;
                        selectedSliderDirtyRef.current = false;
                      }}
                      onChange={(nextLvl) => {
                        const recordHistory =
                          !selectedSliderDraggingRef.current || !selectedSliderDirtyRef.current;
                        if (selectedSliderDraggingRef.current) {
                          selectedSliderDirtyRef.current = true;
                        }
                        updateStrokesBatch(
                          selectedStrokeAnchor.surfaceId,
                          selectedTargetIds,
                          (st) => ({ ...st, size: sizeLevelToPx(st.kind, nextLvl) }),
                          recordHistory
                        );
                      }}
                    />
                  </div>

                  <div className="apple-inspector-section">
                    <div className="apple-slider-head">
                      <span>الكثافة والشفافية</span>
                      <span className="apple-slider-val">{toArabicDigits(selectedOpacityPct)}٪</span>
                    </div>
                    <CalmMagneticSlider
                      value={selectedOpacityPct}
                      min={20}
                      max={100}
                      step={5}
                      magnetStep={5}
                      ariaLabel="شفافية العناصر المحددة"
                      onInteractionStart={() => {
                        selectedSliderDraggingRef.current = true;
                        selectedSliderDirtyRef.current = false;
                      }}
                      onInteractionEnd={() => {
                        selectedSliderDraggingRef.current = false;
                        selectedSliderDirtyRef.current = false;
                      }}
                      onChange={(val) => {
                        const recordHistory =
                          !selectedSliderDraggingRef.current || !selectedSliderDirtyRef.current;
                        if (selectedSliderDraggingRef.current) {
                          selectedSliderDirtyRef.current = true;
                        }
                        updateStrokesBatch(
                          selectedStrokeAnchor.surfaceId,
                          selectedTargetIds,
                          (st) => ({ ...st, opacity: val / 100 }),
                          recordHistory
                        );
                      }}
                    />
                  </div>

                  {hasSelectedPen && (
                    <div className="apple-inspector-section">
                      <div className="apple-segmented is-three" role="group" aria-label="نمط الخط">
                        {(['solid', 'dashed', 'dotted'] as PenLineStyle[]).map((styleKey) => (
                          <button
                            key={styleKey}
                            type="button"
                            className={`apple-seg-btn ${
                              (primarySelStroke.lineStyle ?? 'solid') === styleKey ? 'is-active' : ''
                            }`}
                            onClick={() =>
                              updateStrokesBatch(
                                selectedStrokeAnchor.surfaceId,
                                selectedTargetIds,
                                (st) => (st.kind === 'pen' ? { ...st, lineStyle: styleKey } : st),
                                true
                              )
                            }
                          >
                            {styleKey === 'solid' ? 'متصل' : styleKey === 'dashed' ? 'متقطع' : 'منقط'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasSelectedFountain && (
                    <div className="apple-inspector-section">
                      <div className="apple-slider-head">
                        <span>زاوية سن الخطّاط</span>
                        <span className="apple-slider-val" dir="ltr">
                          {toArabicDigits(Math.abs(Math.round(primarySelStroke.nibAngleDeg ?? -38)))}°
                        </span>
                      </div>
                      <CalmMagneticSlider
                        value={Math.round(primarySelStroke.nibAngleDeg ?? -38)}
                        min={-75}
                        max={-10}
                        step={5}
                        magnetStep={5}
                        ariaLabel="زاوية سن القلم الخطاط المحدد"
                        onInteractionStart={() => {
                          selectedSliderDraggingRef.current = true;
                          selectedSliderDirtyRef.current = false;
                        }}
                        onInteractionEnd={() => {
                          selectedSliderDraggingRef.current = false;
                          selectedSliderDirtyRef.current = false;
                        }}
                        onChange={(deg) => {
                          const recordHistory =
                            !selectedSliderDraggingRef.current || !selectedSliderDirtyRef.current;
                          if (selectedSliderDraggingRef.current) {
                            selectedSliderDirtyRef.current = true;
                          }
                          updateStrokesBatch(
                            selectedStrokeAnchor.surfaceId,
                            selectedTargetIds,
                            (st) => (st.kind === 'fountain' ? { ...st, nibAngleDeg: deg } : st),
                            recordHistory
                          );
                        }}
                      />
                    </div>
                  )}

                  {hasSelectedTape && (
                    <>
                      <div className="apple-inspector-section">
                        <div className="apple-segmented is-three" role="group" aria-label="نمط الشريط">
                          {(['striped', 'solid', 'dots'] as TapePattern[]).map((pat) => (
                            <button
                              key={pat}
                              type="button"
                              className={`apple-seg-btn ${
                                (primarySelStroke.tapePattern ?? 'striped') === pat ? 'is-active' : ''
                              }`}
                              onClick={() =>
                                updateStrokesBatch(
                                  selectedStrokeAnchor.surfaceId,
                                  selectedTargetIds,
                                  (st) => (st.kind === 'tape' ? { ...st, tapePattern: pat } : st),
                                  true
                                )
                              }
                            >
                              {pat === 'striped' ? 'مخطط' : pat === 'solid' ? 'مصمت' : 'منقط'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="apple-props-flatten-btn"
                        onClick={() => {
                          if (selectedTargetIds.length === 1) {
                            toggleTapeRevealed(selectedStrokeAnchor.surfaceId, primarySelStroke.id);
                          } else {
                            const nextRevealed = !Boolean(primarySelStroke.revealed);
                            updateStrokesBatch(
                              selectedStrokeAnchor.surfaceId,
                              selectedTargetIds,
                              (st) => (st.kind === 'tape' ? { ...st, revealed: nextRevealed } : st),
                              false
                            );
                          }
                        }}
                      >
                        {primarySelStroke.revealed ? (
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{primarySelStroke.revealed ? 'إعادة تغطية النص' : 'كشف النص للمراجعة'}</span>
                      </button>
                    </>
                  )}

                  <div className="apple-selected-props-row">
                    <button
                      type="button"
                      className="apple-props-action-btn"
                      onClick={() =>
                        reorderStrokes(selectedStrokeAnchor.surfaceId, selectedTargetIds, 'front')
                      }
                      title="تقديم للأمام فوق العناصر الأخرى"
                    >
                      <ArrowUpToLine className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>للأمام</span>
                    </button>
                    <button
                      type="button"
                      className="apple-props-action-btn"
                      onClick={() =>
                        reorderStrokes(selectedStrokeAnchor.surfaceId, selectedTargetIds, 'back')
                      }
                      title="إرسال للخلف تحت العناصر الأخرى"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>للخلف</span>
                    </button>
                  </div>

                  {hasSelectedShape && (
                    <button
                      type="button"
                      className="apple-props-flatten-btn"
                      onClick={flattenSelectedShapes}
                      title="تحويل الشكل الهندسي إلى مسار رسم حر"
                    >
                      <Spline className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>تحويل لرسم حر</span>
                    </button>
                  )}
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subtle transient HUD toast when a keyboard shortcut executes */}
      <AnimatePresence>
        {shortcutFeedback && (
          <motion.div
            key={shortcutFeedback.seq}
            className={`apple-shortcut-toast ${
              hasOpenPopover
                ? 'is-top'
                : isPaletteOpen && effectiveDockMode === 'bottom'
                ? 'is-above-dock'
                : 'is-bottom'
            }`}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: APPLE_POPOVER_SPRING,
            }}
            exit={{
              opacity: 0,
              y: 4,
              scale: 0.98,
              transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
            }}
          >
            <span className="apple-shortcut-toast-label">{shortcutFeedback.label}</span>
            <kbd className="apple-shortcut-toast-key" dir="ltr">
              {shortcutFeedback.keycap}
            </kbd>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Magnetic Corner Anchor Ring OR Side/Bottom Station Landing Ghost During Active Drag */}
      {(() => {
        const activeCornerMagnet: 'left' | 'right' | null =
          isPaletteOpen && isDragging && dropPreview?.kind === 'orb'
            ? dropPreview.side
            : !isPaletteOpen && isOrbDragging && orbDragMagnet
            ? orbDragMagnet
            : null;
        const stationGhost:
          | { key: string; left: number; top: number; w: number; h: number }
          | null = (() => {
          if (!isPaletteOpen || !isDragging || !dropPreview || dropPreview.kind === 'orb') {
            return null;
          }
          if (dropPreview.kind === 'side' && (dropPreview.side !== dockPlacement.mode || hasDragMorphed)) {
            const sideW = sideDimsRef.current.w || 64;
            const left =
              dropPreview.side === 'left'
                ? SIDE_DOCK_MARGIN_X
                : viewportSize.vw - SIDE_DOCK_MARGIN_X - sideW;
            return {
              key: `side-${dropPreview.side}`,
              left,
              top: dropPreview.topPx,
              w: sideW,
              h: dropPreview.h,
            };
          }
          if (dropPreview.kind === 'bottom-edge' && (dockPlacement.mode !== 'bottom' || hasDragMorphed)) {
            return {
              key: 'bottom-edge',
              left: (viewportSize.vw - dropPreview.w) * 0.5,
              top: viewportSize.vh - BOTTOM_DOCK_MARGIN - dropPreview.h,
              w: dropPreview.w,
              h: dropPreview.h,
            };
          }
          return null;
        })();

        return (
          <AnimatePresence>
            {activeCornerMagnet && (
              <motion.div
                key={`corner-magnet-${activeCornerMagnet}`}
                className="apple-corner-magnet-ring"
                aria-hidden="true"
                initial={{ opacity: 0, scale: 1.24 }}
                animate={{ opacity: 1, scale: 1, transition: APPLE_ORB_SPRING }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12, ease: APPLE_EXIT_EASE } }}
                style={{
                  left: `${Math.round(
                    resolveOrbCoords({ side: activeCornerMagnet }, viewportSize.vw, viewportSize.vh).left
                  )}px`,
                  top: `${Math.round(
                    resolveOrbCoords({ side: activeCornerMagnet }, viewportSize.vw, viewportSize.vh).top
                  )}px`,
                }}
              />
            )}
            {stationGhost && (
              <motion.div
                key={`station-ghost-${stationGhost.key}`}
                className="apple-dock-station-ghost"
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1, transition: APPLE_MORPH_SPRING }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: APPLE_EXIT_EASE } }}
                style={{
                  left: `${Math.round(stationGhost.left)}px`,
                  top: `${Math.round(stationGhost.top)}px`,
                  width: `${Math.round(stationGhost.w)}px`,
                  height: `${Math.round(stationGhost.h)}px`,
                }}
              />
            )}
          </AnimatePresence>
        );
      })()}

      <AnimatePresence>
        {!isPaletteOpen ? (
          <motion.div
            key="launcher"
            className="apple-launcher-anchor"
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.92,
              transition: { duration: 0.12, ease: APPLE_IPAD_EASE },
            }}
            style={{
              left: 0,
              top: 0,
              x: orbX,
              y: orbY,
              pointerEvents: isPaletteOpen ? 'none' : undefined,
            }}
          >
            <motion.button
              ref={orbBtnRef}
              type="button"
              className={`apple-palette-launcher ${isOrbDragging ? 'is-dragging' : ''} ${
                orbDragTarget ? 'is-orb-primed' : ''
              } ${activeTool !== 'cursor' ? 'has-active-tool' : ''}`}
              onPointerDown={handleOrbPointerDown}
              onClick={(e) => {
                // Keyboard activation (Enter / Space) opens palette cleanly
                if (e.detail === 0) {
                  openPaletteFromOrb();
                }
              }}
              title={
                activeTool === 'cursor'
                  ? 'اضغط لفتح شريط الأقلام (D) · أو اسحب الكرة لأي مكان لفتح الشريط فيه'
                  : `اضغط لفتح شريط الأقلام (D) · الأداة النشطة: ${TOOL_LABELS[activeTool]} · أو اسحب الكرة لأي مكان لفتح الشريط فيه`
              }
              aria-label="فتح شريط الأقلام"
              animate={{
                scale: orbDragTarget ? 1.12 : isOrbDragging ? 1.07 : 1,
              }}
              transition={APPLE_ORB_SPRING}
              style={{
                opacity: orbLauncherOpacity,
                pointerEvents: isPaletteOpen ? 'none' : undefined,
                ...(activeTool !== 'cursor'
                  ? ({
                      '--orb-accent':
                        activeTool === 'eraser'
                          ? eraserSettings.highlighterOnly
                            ? '#F59E0B'
                            : '#E11D48'
                          : activeTool === 'lasso'
                          ? '#007AFF'
                          : activeTool === 'fountain'
                          ? fountainSettings.color
                          : activeTool === 'pencil'
                          ? pencilSettings.color
                          : activeTool === 'highlighter'
                          ? highlighterSettings.color
                          : activeTool === 'tape'
                          ? tapeSettings.color
                          : activeTool === 'laser'
                          ? laserSettings.color
                          : penSettings.color,
                    } as React.CSSProperties)
                  : {}),
              }}
            >
              <AppleOrbLiveTool
                activeTool={activeTool}
                penColor={penSettings.color}
                penSizeLevel={penSizeLevel}
                fountainColor={fountainSettings.color}
                fountainSizeLevel={fountainSizeLevel}
                pencilColor={pencilSettings.color}
                pencilSizeLevel={pencilSizeLevel}
                highlighterColor={highlighterSettings.color}
                highlighterSizeLevel={highlighterSizeLevel}
                tapeColor={tapeSettings.color}
                tapeSizeLevel={tapeSizeLevel}
                laserColor={laserSettings.color}
                laserSizeLevel={pxToLaserSizeLevel(laserSettings.size)}
                eraserSizeLevel={eraserSizeLevel}
                eraserHighlighterOnly={Boolean(eraserSettings.highlighterOnly)}
              />
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="dock"
            ref={dockRootRef}
            className={`apple-palette-anchor ${
              effectiveDockMode === 'left'
                ? 'is-side is-side-left'
                : effectiveDockMode === 'right'
                ? 'is-side is-side-right'
                : ''
            } ${isSideTop ? 'is-side-top' : ''} ${isDockInTopHalf ? 'is-top-half' : ''} ${
              isDragging ? 'is-dragging' : ''
            } ${isDragging && dropPreview?.kind === 'orb' ? 'is-edge-primed' : ''}`}
            variants={dockAnchorVariants}
            exit="exit"
            style={{
              left: 0,
              top: 0,
              bottom: 'auto',
              right: 'auto',
              x: dockX,
              y: dockY,
              scale: dockScale,
              pointerEvents: isPaletteOpen ? 'auto' : 'none',
            }}
          >
            <motion.div
              className="apple-palette-motion-shell"
              variants={dockMotionShellVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Contextual Apple PencilKit Inspector Popover */}
              <div className="apple-inspector-anchor">
                <AnimatePresence>
                  {isInspectorOpen && hasInspectorOptions && (
                    <motion.div
                      className="apple-inspector-popover"
                      role="dialog"
                      aria-label={`إعدادات ${TOOL_LABELS[activeTool]}`}
                      initial={{ opacity: 0, x: popoverAxisOffset.x * 0.5, y: popoverAxisOffset.y * 0.5, scale: 0.97 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        y: 0,
                        scale: 1,
                        transition: APPLE_POPOVER_SPRING,
                      }}
                      exit={{
                        opacity: 0,
                        x: popoverAxisOffset.x * 0.3,
                        y: popoverAxisOffset.y * 0.3,
                        scale: 0.98,
                        transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
                      }}
                    >
                  {/* Pen Preview + Opacity + Line Style + Smart Shapes + Scribble Erase */}
                  {activeTool === 'pen' && (
                    <>
                      <div className="apple-inspector-preview" aria-hidden="true">
                        <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                          <path
                            d="M14 23 C 46 6, 74 30, 108 16 C 134 5, 152 22, 166 13"
                            stroke={penSettings.color}
                            strokeOpacity={penSettings.opacity}
                            strokeWidth={previewStrokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={previewDashArray}
                          />
                        </svg>
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>الكثافة</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(penSettings.opacity * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(penSettings.opacity * 100)}
                          min={35}
                          max={100}
                          step={5}
                          magnetStep={5}
                          ariaLabel="كثافة حبر القلم"
                          ariaValueText={`${toArabicDigits(Math.round(penSettings.opacity * 100))} بالمئة`}
                          onChange={(val) => updatePenSettings({ opacity: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>سلاسة الخط</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(penSettings.smoothing * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(penSettings.smoothing * 100)}
                          min={0}
                          max={100}
                          step={5}
                          magnetStep={10}
                          ariaLabel="سلاسة وتنعيم خط القلم"
                          ariaValueText={`${toArabicDigits(Math.round(penSettings.smoothing * 100))} بالمئة`}
                          onChange={(val) => updatePenSettings({ smoothing: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-segmented is-three" role="group" aria-label="نمط خط القلم">
                          <button
                            type="button"
                            className={`apple-seg-btn apple-line-style-btn ${
                              penSettings.lineStyle === 'solid' ? 'is-active' : ''
                            }`}
                            onClick={() => updatePenSettings({ lineStyle: 'solid' })}
                            title="خط متصل"
                          >
                            <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true">
                              <line x1="2" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                            <span>متصل</span>
                          </button>
                          <button
                            type="button"
                            className={`apple-seg-btn apple-line-style-btn ${
                              penSettings.lineStyle === 'dashed' ? 'is-active' : ''
                            }`}
                            onClick={() => updatePenSettings({ lineStyle: 'dashed' })}
                            title="خط متقطع"
                          >
                            <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true">
                              <line x1="2" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="5 4" />
                            </svg>
                            <span>متقطع</span>
                          </button>
                          <button
                            type="button"
                            className={`apple-seg-btn apple-line-style-btn ${
                              penSettings.lineStyle === 'dotted' ? 'is-active' : ''
                            }`}
                            onClick={() => updatePenSettings({ lineStyle: 'dotted' })}
                            title="خط منقط"
                          >
                            <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true">
                              <line x1="3" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 5" />
                            </svg>
                            <span>منقط</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Fountain Pen Preview + Opacity + Nib Angle + Smoothing + Smart Shapes + Scribble */}
                  {activeTool === 'fountain' && (
                    <>
                      <div className="apple-inspector-preview" aria-hidden="true">
                        <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                          <path
                            d={buildFountainPreviewSvgPath(
                              fountainSettings.nibAngleDeg,
                              fountainSettings.size
                            )}
                            fill={fountainSettings.color}
                            fillOpacity={fountainSettings.opacity}
                          />
                        </svg>
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>الكثافة</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(fountainSettings.opacity * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(fountainSettings.opacity * 100)}
                          min={35}
                          max={100}
                          step={5}
                          magnetStep={5}
                          ariaLabel="كثافة حبر قلم الخطاط"
                          onChange={(val) => updateFountainSettings({ opacity: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>زاوية السن</span>
                          <span className="apple-slider-val" dir="ltr">
                            {toArabicDigits(Math.abs(fountainSettings.nibAngleDeg))}°
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={fountainSettings.nibAngleDeg}
                          min={-75}
                          max={-10}
                          step={5}
                          magnetStep={5}
                          ariaLabel="زاوية سن قلم الخطاط"
                          onChange={(deg) => updateFountainSettings({ nibAngleDeg: deg })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>سلاسة الخط</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(fountainSettings.smoothing * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(fountainSettings.smoothing * 100)}
                          min={0}
                          max={100}
                          step={5}
                          magnetStep={10}
                          ariaLabel="سلاسة وتنعيم خط قلم الخطاط"
                          ariaValueText={`${toArabicDigits(Math.round(fountainSettings.smoothing * 100))} بالمئة`}
                          onChange={(val) => updateFountainSettings({ smoothing: val / 100 })}
                        />
                      </div>
                    </>
                  )}

                  {/* Graphite Pencil Preview + Density + Smoothing */}
                  {activeTool === 'pencil' && (
                    <>
                      <div className="apple-inspector-preview" aria-hidden="true">
                        <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                          <path
                            d="M16 22 C 48 8, 78 28, 112 16 C 138 6, 152 22, 166 14"
                            stroke={pencilSettings.color}
                            strokeOpacity={pencilSettings.opacity * 0.34}
                            strokeWidth={Math.max(1.8, Math.min(10.5, pencilSettings.size * 0.78))}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="1.4 1.8"
                          />
                          <path
                            d="M16 22 C 48 8, 78 28, 112 16 C 138 6, 152 22, 166 14"
                            stroke={pencilSettings.color}
                            strokeOpacity={pencilSettings.opacity * 0.72}
                            strokeWidth={Math.max(1.1, Math.min(6.4, pencilSettings.size * 0.46))}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>ضغط الرصاص</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(pencilSettings.opacity * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(pencilSettings.opacity * 100)}
                          min={35}
                          max={95}
                          step={5}
                          magnetStep={5}
                          ariaLabel="ضغط وشفافية قلم الرصاص"
                          onChange={(val) => updatePencilSettings({ opacity: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>سلاسة الخط</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(pencilSettings.smoothing * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(pencilSettings.smoothing * 100)}
                          min={0}
                          max={100}
                          step={5}
                          magnetStep={10}
                          ariaLabel="سلاسة وتنعيم خط قلم الرصاص"
                          ariaValueText={`${toArabicDigits(Math.round(pencilSettings.smoothing * 100))} بالمئة`}
                          onChange={(val) => updatePencilSettings({ smoothing: val / 100 })}
                        />
                      </div>
                    </>
                  )}

                  {/* Study / Memorization Tape Pattern + Opacity + Straight Assist */}
                  {activeTool === 'tape' && (
                    <>
                      <div className="apple-inspector-preview is-highlighter is-tape" aria-hidden="true">
                        <div className="apple-preview-text-lines" />
                        <div
                          className={`apple-tape-preview-bar is-${tapeSettings.pattern}`}
                          style={{
                            height: `${Math.max(10, Math.min(22, tapeSettings.size * 0.48))}px`,
                            backgroundColor: tapeSettings.color,
                            opacity: 1,
                          }}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>نقش الشريط</span>
                        </div>
                        <div className="apple-segmented is-three" role="group" aria-label="نقش شريط التحفيظ">
                          {(['striped', 'solid', 'dots'] as TapePattern[]).map((pat) => (
                            <button
                              key={pat}
                              type="button"
                              className={`apple-seg-btn ${tapeSettings.pattern === pat ? 'is-active' : ''}`}
                              onClick={() => updateTapeSettings({ pattern: pat })}
                            >
                              {pat === 'striped' ? 'مخطط' : pat === 'solid' ? 'مصمت' : 'منقط'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>سلاسة الخط</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(tapeSettings.smoothing * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(tapeSettings.smoothing * 100)}
                          min={0}
                          max={100}
                          step={5}
                          magnetStep={10}
                          ariaLabel="سلاسة وتنعيم خط شريط التحفيظ"
                          ariaValueText={`${toArabicDigits(Math.round(tapeSettings.smoothing * 100))} بالمئة`}
                          onChange={(val) => updateTapeSettings({ smoothing: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-toggle-row">
                        <span className="apple-toggle-title">استقامة الشريط تلقائياً</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={tapeSettings.straightAssist}
                          className={`apple-switch ${tapeSettings.straightAssist ? 'is-on' : ''}`}
                          onClick={() =>
                            updateTapeSettings({ straightAssist: !tapeSettings.straightAssist })
                          }
                        >
                          <span className="apple-switch-knob" />
                        </button>
                      </div>
                    </>
                  )}

                  {/* Highlighter Preview + Transparency + Smoothing + Straight Assist */}
                  {activeTool === 'highlighter' && (
                    <>
                      <div className="apple-inspector-preview is-highlighter" aria-hidden="true">
                        <div className="apple-preview-text-lines" />
                        <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                          {(() => {
                            const h = Math.max(8, Math.min(20, highlighterSettings.size * 0.44));
                            const halfH = h * 0.5;
                            const slant = halfH * 0.404; // tan(22deg) matching -22deg chisel nib
                            const yTop = 17 - halfH;
                            const yBot = 17 + halfH;
                            return (
                              <polygon
                                points={`${24 + slant},${yTop} ${156 + slant},${yTop} ${156 - slant},${yBot} ${24 - slant},${yBot}`}
                                fill={highlighterSettings.color}
                                fillOpacity={highlighterSettings.opacity}
                                style={{ mixBlendMode: 'multiply' }}
                              />
                            );
                          })()}
                        </svg>
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>الشفافية</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(highlighterSettings.opacity * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(highlighterSettings.opacity * 100)}
                          min={20}
                          max={90}
                          step={5}
                          magnetStep={5}
                          ariaLabel="شفافية قلم التظليل"
                          ariaValueText={`${toArabicDigits(Math.round(highlighterSettings.opacity * 100))} بالمئة`}
                          onChange={(val) => updateHighlighterSettings({ opacity: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-section">
                        <div className="apple-slider-head">
                          <span>سلاسة الخط</span>
                          <span className="apple-slider-val">
                            {toArabicDigits(Math.round(highlighterSettings.smoothing * 100))}٪
                          </span>
                        </div>
                        <CalmMagneticSlider
                          value={Math.round(highlighterSettings.smoothing * 100)}
                          min={0}
                          max={100}
                          step={5}
                          magnetStep={10}
                          ariaLabel="سلاسة وتنعيم خط قلم التظليل"
                          ariaValueText={`${toArabicDigits(Math.round(highlighterSettings.smoothing * 100))} بالمئة`}
                          onChange={(val) => updateHighlighterSettings({ smoothing: val / 100 })}
                        />
                      </div>

                      <div className="apple-inspector-toggle-row">
                        <span className="apple-toggle-title">استقامة السحب التلقائي</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={highlighterSettings.straightAssist}
                          className={`apple-switch ${highlighterSettings.straightAssist ? 'is-on' : ''}`}
                          onClick={() =>
                            updateHighlighterSettings({
                              straightAssist: !highlighterSettings.straightAssist,
                            })
                          }
                        >
                          <span className="apple-switch-knob" />
                        </button>
                      </div>
                    </>
                  )}

                  {/* Optical Laser Preview + Mode, Size, Fade Duration & Smoothing */}
                  {activeTool === 'laser' && (() => {
                    const laserSizeLevel = pxToLaserSizeLevel(laserSettings.size);
                    const beamW = Math.max(2.1, Math.min(8.4, laserSettings.size * 0.92));
                    const dotR = Math.max(3.6, Math.min(7.4, 2.4 + laserSettings.size * 0.56));

                    return (
                      <>
                        <div
                          className="apple-inspector-preview"
                          style={{
                            background: '#0F172A',
                            borderColor: 'rgba(15, 23, 42, 0.25)',
                          }}
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                            <defs>
                              <radialGradient id="pkLaserPreviewAura" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor={laserSettings.color} stopOpacity="0.62" />
                                <stop offset="48%" stopColor={laserSettings.color} stopOpacity="0.22" />
                                <stop offset="100%" stopColor={laserSettings.color} stopOpacity="0" />
                              </radialGradient>
                            </defs>

                            {/* Subtle slate reference lines */}
                            <line x1="20" y1="12" x2="160" y2="12" stroke="rgba(148, 163, 184, 0.14)" strokeWidth="1.2" />
                            <line x1="20" y1="22" x2="160" y2="22" stroke="rgba(148, 163, 184, 0.14)" strokeWidth="1.2" />

                            {laserSettings.mode === 'trail' ? (
                              <>
                                <path
                                  d="M16 23 C 46 6, 74 30, 108 16 C 134 5, 152 22, 164 13"
                                  stroke={laserSettings.color}
                                  strokeOpacity="0.26"
                                  strokeWidth={beamW * 2.2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M16 23 C 46 6, 74 30, 108 16 C 134 5, 152 22, 164 13"
                                  stroke={laserSettings.color}
                                  strokeOpacity="0.96"
                                  strokeWidth={beamW * 0.94}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M16 23 C 46 6, 74 30, 108 16 C 134 5, 152 22, 164 13"
                                  stroke="#FFFFFF"
                                  strokeOpacity="0.88"
                                  strokeWidth={Math.max(0.85, beamW * 0.34)}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <circle cx="164" cy="13" r={Math.max(2.6, beamW * 0.65)} fill={laserSettings.color} />
                                <circle cx="164" cy="13" r={Math.max(1.1, beamW * 0.25)} fill="#FFFFFF" />
                              </>
                            ) : (
                              <>
                                <circle cx="90" cy="17" r={dotR * 2.35} fill="url(#pkLaserPreviewAura)" />
                                <circle
                                  cx="90"
                                  cy="17"
                                  r={dotR}
                                  fill={laserSettings.color}
                                  stroke="rgba(255, 255, 255, 0.92)"
                                  strokeWidth="1.2"
                                />
                                <circle cx="90" cy="17" r={Math.max(1.3, dotR * 0.36)} fill="#FFFFFF" />
                              </>
                            )}
                          </svg>
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-segmented" role="group" aria-label="نمط مؤشر الليزر">
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                laserSettings.mode === 'trail' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLaserSettings({ mode: 'trail' })}
                              title="يرسم شعاعاً مضيئاً يتلاشى تلقائياً بعد رفع القلم"
                            >
                              <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                                <path
                                  d="M3 7.5 C 8 2, 15 8, 22 2.8"
                                  stroke="currentColor"
                                  strokeWidth="2.1"
                                  strokeLinecap="round"
                                />
                                <circle cx="22.5" cy="2.6" r="1.7" fill="currentColor" />
                              </svg>
                              <span>شعاع متلاشٍ</span>
                            </button>
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                laserSettings.mode === 'dot' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLaserSettings({ mode: 'dot' })}
                              title="نقطة ضوئية فورية مع نبضة عند النقر"
                            >
                              <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                                <circle cx="13" cy="5" r="4.2" fill="currentColor" fillOpacity="0.2" />
                                <circle cx="13" cy="5" r="2.2" fill="currentColor" />
                              </svg>
                              <span>نقطة فقط</span>
                            </button>
                          </div>
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-slider-head">
                            <span>حجم الليزر</span>
                            <span className="apple-slider-val">
                              {toArabicDigits(laserSizeLevel)}٪
                            </span>
                          </div>
                          <CalmMagneticSlider
                            value={laserSizeLevel}
                            min={SIZE_DIAL_MIN}
                            max={SIZE_DIAL_MAX}
                            step={SIZE_DIAL_STEP}
                            magnetStep={5}
                            ariaLabel="حجم مؤشر الليزر"
                            ariaValueText={`${toArabicDigits(laserSizeLevel)} بالمئة`}
                            onChange={(lvl) => updateLaserSettings({ size: laserSizeLevelToPx(lvl) })}
                          />
                        </div>

                        {laserSettings.mode === 'trail' && (
                          <>
                            <div className="apple-inspector-section">
                              <div className="apple-slider-head">
                                <span>سلاسة الخط</span>
                                <span className="apple-slider-val">
                                  {toArabicDigits(Math.round(laserSettings.smoothing * 100))}٪
                                </span>
                              </div>
                              <CalmMagneticSlider
                                value={Math.round(laserSettings.smoothing * 100)}
                                min={0}
                                max={100}
                                step={5}
                                magnetStep={10}
                                ariaLabel="سلاسة وتنعيم خط الليزر"
                                ariaValueText={`${toArabicDigits(Math.round(laserSettings.smoothing * 100))} بالمئة`}
                                onChange={(val) => updateLaserSettings({ smoothing: val / 100 })}
                              />
                            </div>

                            <div className="apple-inspector-section">
                              <div className="apple-slider-head">
                                <span>مدة بقاء الشعاع</span>
                                <span className="apple-slider-val">
                                  {toArabicDigits(
                                    (Math.round(laserSettings.fadeDurationMs / 100) / 10)
                                      .toFixed(1)
                                      .replace('.', '٫')
                                  )}{' '}
                                  ث
                                </span>
                              </div>
                              <CalmMagneticSlider
                                value={Math.max(5, Math.min(30, Math.round(laserSettings.fadeDurationMs / 100)))}
                                min={5}
                                max={30}
                                step={5}
                                magnetStep={5}
                                ariaLabel="مدة بقاء شعاع الليزر بالثواني"
                                onChange={(decisec) =>
                                  updateLaserSettings({ fadeDurationMs: decisec * 100 })
                                }
                              />
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}

                  {/* Smart Eraser Preview + Size + Mode + Highlighter-Only Filter */}
                  {activeTool === 'eraser' && (() => {
                    const hlOnly = Boolean(eraserSettings.highlighterOnly);
                    const isPartial = eraserSettings.mode === 'partial';
                    const previewR = Math.max(5.5, Math.min(13.5, eraserSettings.size * 0.24));
                    const accentStroke = hlOnly ? '#D97706' : '#E11D48';
                    const accentFill = hlOnly
                      ? 'rgba(254, 243, 199, 0.52)'
                      : 'rgba(251, 207, 232, 0.44)';

                    return (
                      <>
                        <div className="apple-inspector-preview" aria-hidden="true">
                          <div className="apple-preview-text-lines" />
                          <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                            <defs>
                              <mask id="pkEraserInspectorPreviewMask">
                                <rect x="0" y="0" width="180" height="34" fill="white" />
                                <circle cx="90" cy="17" r={previewR} fill="black" />
                              </mask>
                            </defs>

                            {/* Highlighter bar (always affected by eraser) */}
                            <rect
                              x="24"
                              y="12"
                              width="132"
                              height="10"
                              rx="3"
                              fill="#FACC15"
                              fillOpacity={isPartial ? 0.56 : 0.26}
                              mask={isPartial ? 'url(#pkEraserInspectorPreviewMask)' : undefined}
                              style={{ mixBlendMode: 'multiply' }}
                            />

                            {/* Ink stroke (stays untouched when highlighterOnly is active) */}
                            <path
                              d="M18 22 C 48 8, 76 28, 108 15 C 134 5, 152 22, 164 13"
                              stroke="#1E293B"
                              strokeOpacity={hlOnly ? 0.92 : isPartial ? 0.88 : 0.24}
                              strokeWidth="2.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              mask={
                                isPartial && !hlOnly
                                  ? 'url(#pkEraserInspectorPreviewMask)'
                                  : undefined
                              }
                            />

                            {/* Soft footprint halo */}
                            <circle
                              cx="90"
                              cy="17"
                              r={previewR + 2.2}
                              fill={hlOnly ? 'rgba(245, 158, 11, 0.1)' : 'rgba(225, 29, 72, 0.08)'}
                            />
                            {/* Live Eraser Footprint Circle */}
                            <circle
                              cx="90"
                              cy="17"
                              r={previewR}
                              fill={accentFill}
                              stroke={accentStroke}
                              strokeWidth="1.5"
                              strokeDasharray={isPartial ? '3.2 2.4' : undefined}
                            />
                            {hlOnly && (
                              <circle cx="90" cy="17" r="1.8" fill="#D97706" />
                            )}
                          </svg>
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-slider-head">
                            <span>حجم الممحاة</span>
                            <span className="apple-slider-val">
                              {toArabicDigits(eraserSizeLevel)}٪
                            </span>
                          </div>
                          <CalmMagneticSlider
                            value={eraserSizeLevel}
                            min={SIZE_DIAL_MIN}
                            max={SIZE_DIAL_MAX}
                            step={SIZE_DIAL_STEP}
                            magnetStep={5}
                            ariaLabel="حجم الممحاة"
                            ariaValueText={`${toArabicDigits(eraserSizeLevel)} بالمئة`}
                            onChange={(lvl) =>
                              updateEraserSettings({ size: sizeLevelToPx('eraser', lvl) })
                            }
                          />
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-slider-head">
                            <span>وضع المسح</span>
                          </div>
                          <div className="apple-segmented" role="group" aria-label="وضع الممحاة">
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                eraserSettings.mode === 'stroke' ? 'is-active' : ''
                              }`}
                              onClick={() => updateEraserSettings({ mode: 'stroke' })}
                              title="مسح العنصر كاملاً عند لمسه"
                            >
                              <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                                <line
                                  x1="2"
                                  y1="5"
                                  x2="24"
                                  y2="5"
                                  stroke="currentColor"
                                  strokeOpacity="0.32"
                                  strokeWidth="2.1"
                                  strokeLinecap="round"
                                />
                                <circle
                                  cx="13"
                                  cy="5"
                                  r="3.4"
                                  fill="rgba(225, 29, 72, 0.16)"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                />
                              </svg>
                              <span>عنصر كامل</span>
                            </button>
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                eraserSettings.mode === 'partial' ? 'is-active' : ''
                              }`}
                              onClick={() => updateEraserSettings({ mode: 'partial' })}
                              title="قص ومسح الجزء الملامس فقط من الخط"
                            >
                              <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                                <line
                                  x1="2"
                                  y1="5"
                                  x2="8"
                                  y2="5"
                                  stroke="currentColor"
                                  strokeWidth="2.1"
                                  strokeLinecap="round"
                                />
                                <line
                                  x1="18"
                                  y1="5"
                                  x2="24"
                                  y2="5"
                                  stroke="currentColor"
                                  strokeWidth="2.1"
                                  strokeLinecap="round"
                                />
                                <circle
                                  cx="13"
                                  cy="5"
                                  r="3.4"
                                  fill="rgba(225, 29, 72, 0.14)"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeDasharray="1.8 1.5"
                                />
                              </svg>
                              <span>مسح جزئي</span>
                            </button>
                          </div>
                        </div>

                        <div className="apple-inspector-toggle-row">
                          <span className="apple-toggle-title">مسح التظليل فقط</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={hlOnly}
                            className={`apple-switch ${hlOnly ? 'is-on' : ''}`}
                            onClick={() =>
                              updateEraserSettings({
                                highlighterOnly: !eraserSettings.highlighterOnly,
                              })
                            }
                            title="يمسح التظليل وشريط التحفيظ فقط دون المساس بكتابات الحبر والرصاص"
                          >
                            <span className="apple-switch-knob" />
                          </button>
                        </div>
                      </>
                    );
                  })()}

                  {/* Smart Lasso Preview + Mode + Match Scope + Highlighter Filter */}
                  {activeTool === 'lasso' && (() => {
                    const isRect = lassoSettings.mode === 'rect';
                    const isContain = lassoSettings.matchMode === 'contain';
                    const includeHl = lassoSettings.includeHighlights;

                    return (
                      <>
                        <div className="apple-inspector-preview" aria-hidden="true">
                          <div className="apple-preview-text-lines" />
                          <svg viewBox="0 0 180 34" className="apple-inspector-preview-svg" fill="none">
                            {/* Sample highlight strip */}
                            <rect
                              x="44"
                              y="12"
                              width="92"
                              height="10"
                              rx="3"
                              fill="#FACC15"
                              fillOpacity={includeHl ? 0.56 : 0.24}
                              style={{ mixBlendMode: 'multiply' }}
                            />
                            {/* Sample ink arc inside lasso frame */}
                            <path
                              d="M54 21 C 74 11, 102 25, 126 14"
                              stroke="#007AFF"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                            />
                            {/* Neighbor edge line demonstrating touch vs contain */}
                            <line
                              x1="22"
                              y1="17"
                              x2="45"
                              y2="17"
                              stroke={isContain ? '#94A3B8' : '#007AFF'}
                              strokeOpacity={isContain ? 0.55 : 0.92}
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            />

                            {isRect ? (
                              <>
                                <rect
                                  x="40"
                                  y="5"
                                  width="100"
                                  height="24"
                                  rx="2.5"
                                  fill="rgba(0, 122, 255, 0.08)"
                                  stroke="#007AFF"
                                  strokeWidth="1.5"
                                  strokeDasharray="4 3"
                                />
                                <circle cx="40" cy="5" r="2" fill="#FFFFFF" stroke="#007AFF" strokeWidth="1.2" />
                                <circle cx="140" cy="5" r="2" fill="#FFFFFF" stroke="#007AFF" strokeWidth="1.2" />
                                <circle cx="140" cy="29" r="2" fill="#FFFFFF" stroke="#007AFF" strokeWidth="1.2" />
                                <circle cx="40" cy="29" r="2" fill="#FFFFFF" stroke="#007AFF" strokeWidth="1.2" />
                              </>
                            ) : (
                              <path
                                d="M40 16 C 40 6, 72 4, 96 6 C 122 8, 144 6, 144 17 C 144 28, 118 30, 88 28 C 60 27, 40 26, 40 16 Z"
                                fill="rgba(0, 122, 255, 0.08)"
                                stroke="#007AFF"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeDasharray="4 3"
                              />
                            )}
                          </svg>
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-slider-head">
                            <span>نمط التحديد</span>
                          </div>
                          <div className="apple-segmented" role="group" aria-label="نمط أداة التحديد">
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                lassoSettings.mode === 'freeform' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLassoSettings({ mode: 'freeform' })}
                              title="ارسم طوقاً حراً حول العناصر لتحديدها"
                            >
                              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
                                <path
                                  d="M4 6.5 C 4 2.5, 9.5 1.5, 14 2.5 C 19 3.5, 20.5 6.5, 19 9 C 17 11, 10 10.5, 6 9.5 C 4.5 9, 4 7.8, 4 6.5 Z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeDasharray="3 2.2"
                                />
                              </svg>
                              <span>تحديد حر</span>
                            </button>
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                lassoSettings.mode === 'rect' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLassoSettings({ mode: 'rect' })}
                              title="اسحب مستطيل تحديد سريع حول العناصر"
                            >
                              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
                                <rect
                                  x="4.5"
                                  y="2"
                                  width="15"
                                  height="8"
                                  rx="1.2"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeDasharray="3 2.2"
                                />
                              </svg>
                              <span>مستطيل</span>
                            </button>
                          </div>
                        </div>

                        <div className="apple-inspector-section">
                          <div className="apple-slider-head">
                            <span>نطاق الالتقاط</span>
                          </div>
                          <div className="apple-segmented" role="group" aria-label="نطاق التقاط التحديد">
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                lassoSettings.matchMode === 'touch' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLassoSettings({ matchMode: 'touch' })}
                              title="يلتقط كل عنصر يلامسه إطار التحديد"
                            >
                              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
                                <line x1="2" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <rect
                                  x="9"
                                  y="2"
                                  width="12"
                                  height="8"
                                  rx="1.2"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeDasharray="2.8 2"
                                />
                              </svg>
                              <span>بالتلامس</span>
                            </button>
                            <button
                              type="button"
                              className={`apple-seg-btn apple-line-style-btn ${
                                lassoSettings.matchMode === 'contain' ? 'is-active' : ''
                              }`}
                              onClick={() => updateLassoSettings({ matchMode: 'contain' })}
                              title="يلتقط العناصر الواقعة بالكامل داخل إطار التحديد فقط"
                            >
                              <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
                                <line x1="9" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <rect
                                  x="5"
                                  y="2"
                                  width="14"
                                  height="8"
                                  rx="1.2"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeDasharray="2.8 2"
                                />
                              </svg>
                              <span>احتواء كامل</span>
                            </button>
                          </div>
                        </div>

                        <div className="apple-inspector-toggle-row">
                          <span className="apple-toggle-title">تضمين التظليل والشريط</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={includeHl}
                            className={`apple-switch ${includeHl ? 'is-on' : ''}`}
                            onClick={() => updateLassoSettings({ includeHighlights: !includeHl })}
                            title="تحديد التظليل وأشرطة التحفيظ مع الكتابات أو استثناؤها"
                          >
                            <span className="apple-switch-knob" />
                          </button>
                        </div>
                      </>
                    );
                  })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            {/* Main Floating Apple PencilKit Dock */}
            <motion.div
              className="apple-palette-dock"
              role="toolbar"
              aria-label="منظومة الأقلام والتظليل والليزر"
              style={{
                clipPath: dockClipPath,
                x: dockMorphShiftX,
                y: dockMorphShiftY,
                scaleX: dockMorphScaleX,
                scaleY: dockMorphScaleY,
                rotate: dockMorphRotate,
              }}
              onPointerDown={handleDockPointerDown}
              onClickCapture={(e) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <motion.div
                ref={dockMorphShellRef}
                className="apple-dock-morph-shell"
                style={{
                  width: dockMorphW,
                  height: dockMorphH,
                  borderRadius: dockMorphRadius,
                }}
              >
                <div
                  ref={dockMorphGhostHostRef}
                  className="apple-dock-morph-ghost-host"
                  aria-hidden="true"
                />
                <motion.div
                  ref={dockContentRef}
                  className={`apple-dock-content ${
                    effectiveDockMode === 'left'
                      ? 'is-layout-side is-layout-side-left'
                      : effectiveDockMode === 'right'
                      ? 'is-layout-side is-layout-side-right'
                      : 'is-layout-bottom'
                  }`}
                  style={{
                    opacity: dockContentOpacity,
                    scale: dockContentScale,
                  }}
                >
              {/* Zone 1: Drag Handle + Standalone Browse Mode */}
              <button
                type="button"
                className="apple-dock-drag-handle"
                title="اسحب الشريط إلى الأسفل أو أحد الجانبين · اسحبه للحافة لطيّه في الدائرة · نقرتان للأسفل"
                aria-label="سحب شريط الأقلام"
                onPointerDown={handleDragStart}
                onDoubleClick={() => snapDockToPreset('bottom')}
              >
                <GripVertical className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              </button>

              <button
                type="button"
                className={`apple-cursor-btn ${activeTool === 'cursor' ? 'is-active' : ''}`}
                aria-pressed={activeTool === 'cursor'}
                onClick={() => handleSelectTool('cursor')}
                title="وضع التصفح العادي (V) · نقرة على شريط التحفيظ لكشفه"
                aria-label="وضع التصفح العادي"
              >
                <MousePointer2 className="w-4 h-4" strokeWidth={1.95} aria-hidden="true" />
                <span className="apple-cursor-label">تصفح</span>
              </button>

              <div className="apple-dock-divider" aria-hidden="true" />

              {/* Zone 2: Spacious Sliding Pen Tray — 4 Core Tools Visible + Tucked Tools Revealed via Drag/Wheel */}
              <div className="apple-nibs-shell">
                {nibsScrollEdge.canStart && (
                  <button
                    type="button"
                    className="apple-nibs-peek-btn is-start"
                    onClick={() => stepNibsTray('start')}
                    title="إظهار الأقلام الأساسية"
                    aria-label="التمرير للأقلام الأساسية"
                  >
                    {effectiveDockMode === 'bottom' ? (
                      <ChevronRight className="w-3 h-3" strokeWidth={2.3} aria-hidden="true" />
                    ) : (
                      <ChevronUp className="w-3 h-3" strokeWidth={2.3} aria-hidden="true" />
                    )}
                  </button>
                )}

                <div
                  ref={nibsViewportRef}
                  className={`apple-nibs-viewport ${nibsScrollEdge.canStart ? 'has-more-start' : ''} ${
                    nibsScrollEdge.canEnd ? 'has-more-end' : ''
                  } ${isTrayDragging ? 'is-tray-dragging' : ''}`}
                  onPointerDown={handleNibsViewportPointerDown}
                  onWheel={handleNibsWheel}
                  onScroll={updateNibsScrollEdges}
                >
                  <div
                    ref={nibsTrayRef}
                    className="apple-nibs-tray"
                    role="group"
                    aria-label="أدوات الرسم والمؤشر"
                  >
                    <button
                      type="button"
                      className={`apple-nib-slot ${activeTool === 'pen' ? 'is-active' : ''}`}
                      style={{ '--slot-accent': penSettings.color } as React.CSSProperties}
                      aria-pressed={activeTool === 'pen'}
                      onClick={() => handleSelectTool('pen')}
                      title="قلم حبر (P) · اضغط مجدداً للإعدادات"
                      aria-label="قلم حبر"
                    >
                      <span className="apple-nib-orient" aria-hidden="true">
                        <ApplePenNibSvg color={penSettings.color} sizeLevel={penSizeLevel} />
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`apple-nib-slot ${activeTool === 'pencil' ? 'is-active' : ''}`}
                      style={{ '--slot-accent': pencilSettings.color } as React.CSSProperties}
                      aria-pressed={activeTool === 'pencil'}
                      onClick={() => handleSelectTool('pencil')}
                      title="قلم رصاص (G) · ملمس جرافيت ناعم"
                      aria-label="قلم رصاص"
                    >
                      <span className="apple-nib-orient" aria-hidden="true">
                        <ApplePencilNibSvg color={pencilSettings.color} sizeLevel={pencilSizeLevel} />
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`apple-nib-slot ${activeTool === 'highlighter' ? 'is-active' : ''}`}
                      style={{ '--slot-accent': highlighterSettings.color } as React.CSSProperties}
                      aria-pressed={activeTool === 'highlighter'}
                      onClick={() => handleSelectTool('highlighter')}
                      title="تظليل أبل (H) · اضغط مجدداً للشفافية واستقامة السحب"
                      aria-label="تظليل أبل"
                    >
                      <span className="apple-nib-orient" aria-hidden="true">
                        <AppleHighlighterNibSvg
                          color={highlighterSettings.color}
                          sizeLevel={highlighterSizeLevel}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`apple-nib-slot ${activeTool === 'eraser' ? 'is-active' : ''}`}
                      style={
                        {
                          '--slot-accent': eraserSettings.highlighterOnly ? '#F59E0B' : '#E11D48',
                        } as React.CSSProperties
                      }
                      aria-pressed={activeTool === 'eraser'}
                      onClick={() => handleSelectTool('eraser')}
                      title="ممحاة ذكية (E) · اضغط مجدداً لحجم الممحاة ووضع المسح"
                      aria-label="ممحاة ذكية"
                    >
                      <span className="apple-nib-orient" aria-hidden="true">
                        <AppleEraserNibSvg
                          sizeLevel={eraserSizeLevel}
                          highlighterOnly={Boolean(eraserSettings.highlighterOnly)}
                        />
                      </span>
                    </button>

                    {systemSettings.enabledOptionalTools.tape && (
                      <button
                        type="button"
                        className={`apple-nib-slot ${activeTool === 'tape' ? 'is-active' : ''}`}
                        style={{ '--slot-accent': tapeSettings.color } as React.CSSProperties}
                        aria-pressed={activeTool === 'tape'}
                        onClick={() => handleSelectTool('tape')}
                        title="شريط التحفيظ (T) · لإخفاء الكلمات واختبار الحفظ بالنقر"
                        aria-label="شريط التحفيظ"
                      >
                        <span className="apple-nib-orient" aria-hidden="true">
                          <AppleTapeStylusSvg color={tapeSettings.color} sizeLevel={tapeSizeLevel} />
                        </span>
                      </button>
                    )}

                    {systemSettings.enabledOptionalTools.fountain && (
                      <button
                        type="button"
                        className={`apple-nib-slot ${activeTool === 'fountain' ? 'is-active' : ''}`}
                        style={{ '--slot-accent': fountainSettings.color } as React.CSSProperties}
                        aria-pressed={activeTool === 'fountain'}
                        onClick={() => handleSelectTool('fountain')}
                        title="قلم خطّاط (F) · يكتب بسُمكٍ مائل وزاوية سن قابلة للتعديل"
                        aria-label="قلم خطّاط"
                      >
                        <span className="apple-nib-orient" aria-hidden="true">
                          <AppleFountainNibSvg
                            color={fountainSettings.color}
                            sizeLevel={fountainSizeLevel}
                          />
                        </span>
                      </button>
                    )}

                    {systemSettings.enabledOptionalTools.lasso && (
                      <button
                        type="button"
                        className={`apple-nib-slot ${activeTool === 'lasso' ? 'is-active' : ''}`}
                        style={{ '--slot-accent': '#007AFF' } as React.CSSProperties}
                        aria-pressed={activeTool === 'lasso'}
                        onClick={() => handleSelectTool('lasso')}
                        title="تحديد حر ونقل مجموعة عناصر (S) · اضغط مجدداً لإعدادات الالتقاط"
                        aria-label="أداة التحديد الحر"
                      >
                        <span className="apple-nib-orient" aria-hidden="true">
                          <AppleLassoStylusSvg isActive={activeTool === 'lasso'} />
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      className={`apple-nib-slot ${activeTool === 'laser' ? 'is-active' : ''}`}
                      style={{ '--slot-accent': laserSettings.color } as React.CSSProperties}
                      aria-pressed={activeTool === 'laser'}
                      onClick={() => handleSelectTool('laser')}
                      title="مؤشر ليزر ضوئي (L) · اضغط مجدداً للحجم ومدة التلاشي"
                      aria-label="مؤشر ليزر ضوئي"
                    >
                      <span className="apple-nib-orient" aria-hidden="true">
                        <AppleLaserStylusSvg
                          color={laserSettings.color}
                          sizeLevel={pxToLaserSizeLevel(laserSettings.size)}
                          isActive={activeTool === 'laser'}
                        />
                      </span>
                    </button>
                  </div>
                </div>

                {nibsScrollEdge.canEnd && (
                  <button
                    type="button"
                    className="apple-nibs-peek-btn is-end"
                    onClick={() => stepNibsTray('end')}
                    title="سحب لإظهار المزيد من الأقلام والأدوات"
                    aria-label="إظهار المزيد من الأقلام"
                  >
                    {effectiveDockMode === 'bottom' ? (
                      <ChevronLeft className="w-3 h-3" strokeWidth={2.3} aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3 h-3" strokeWidth={2.3} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>

              <div className="apple-dock-divider" aria-hidden="true" />

              {/* Zone 3: 3 Independent Thickness Dots + 3 Quick Color Circles */}
              <DockThicknessSlots
                tool={rollerTool}
                isStandby={activeTool === 'cursor' || activeTool === 'lasso' || activeTool === 'laser'}
                isPulsing={isRollerPulsing}
                suppressPreview={
                  isInspectorOpen ||
                  isDockSettingsOpen ||
                  isShortcutsOpen ||
                  editingColorSlot !== null
                }
                sizeSlots={currentSlots}
                activeSlot={currentActiveSlot}
                editingSlot={editingSlot}
                color={rollerColor}
                dockSide={
                  effectiveDockMode === 'left' || effectiveDockMode === 'right'
                    ? effectiveDockMode
                    : 'bottom'
                }
                isTopHalf={isDockInTopHalf}
                onActivateTool={() => setActiveTool(rollerTool)}
                onSelectSlot={handleSelectSizeSlot}
                onEditingSlotChange={(nextSlot) => {
                  if (nextSlot !== null) {
                    setIsInspectorOpen(false);
                    setIsDockSettingsOpen(false);
                    setIsShortcutsOpen(false);
                    setEditingColorSlot(null);
                  }
                  setEditingSlot(nextSlot);
                }}
                onChangeSlotLevel={handleChangeSlotLevel}
              />

              <DockColorSlots
                tool={colorTool}
                isStandby={activeTool === 'cursor' || activeTool === 'lasso'}
                isHidden={activeTool === 'eraser'}
                colorSlots={currentColorSlots}
                activeSlot={currentActiveColorSlot}
                editingSlot={editingColorSlot}
                palette={currentColorPalette}
                dockSide={
                  effectiveDockMode === 'left' || effectiveDockMode === 'right'
                    ? effectiveDockMode
                    : 'bottom'
                }
                isTopHalf={isDockInTopHalf}
                onActivateTool={() => setActiveTool(colorTool)}
                onSelectSlot={handleSelectColorSlot}
                onEditingSlotChange={(nextSlot) => {
                  if (nextSlot !== null) {
                    setIsInspectorOpen(false);
                    setIsDockSettingsOpen(false);
                    setIsShortcutsOpen(false);
                    setEditingSlot(null);
                  }
                  setEditingColorSlot(nextSlot);
                }}
                onChangeSlotColor={handleChangeSlotColor}
              />

              <div className="apple-dock-divider" aria-hidden="true" />

              {/* Zone 4: History, PNG Export & Clear */}
              <div className="apple-dock-actions" role="group" aria-label="التراجع والتصدير والمسح">
                <button
                  type="button"
                  className="apple-icon-btn"
                  disabled={!canUndo}
                  onClick={() => undo()}
                  title="تراجع خطوة (Ctrl+Z) · للشكل المضبوط: مرة للرسم الحر ومرتان للمسح"
                  aria-label="تراجع عن آخر خطوة"
                >
                  <Undo2 className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="apple-icon-btn"
                  disabled={!canRedo}
                  onClick={() => redo()}
                  title="إعادة الخطوة (Ctrl+Y)"
                  aria-label="إعادة الخطوة"
                >
                  <Redo2 className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="apple-icon-btn"
                  disabled={isExportingPdf}
                  aria-busy={isExportingPdf}
                  onClick={() => void exportActiveSurfacePdf()}
                  title="تنزيل الصفحة الحالية مع الكتابة كملف PDF"
                  aria-label="تنزيل الصفحة الحالية مع الكتابة كملف PDF"
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Download className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="apple-icon-btn is-danger"
                  disabled={!hasActiveStrokes}
                  onClick={() => {
                    clearSurface();
                    emitShortcutFeedback('تم مسح الصفحة · يمكنك التراجع', 'Ctrl+Z');
                  }}
                  title="مسح رسومات الصفحة الحالية (Ctrl+Shift+Del)"
                  aria-label="مسح رسومات الصفحة الحالية"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>

              <div className="apple-dock-divider" aria-hidden="true" />

              <div className="apple-dock-utility" role="group" aria-label="الاختصارات والإعدادات وطي الشريط">
                <div className="apple-shortcuts-wrap">
                  <button
                    type="button"
                    className={`apple-icon-btn ${isShortcutsOpen ? 'is-active-utility' : ''}`}
                    aria-expanded={isShortcutsOpen}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setIsInspectorOpen(false);
                      setIsDockSettingsOpen(false);
                      setEditingSlot(null);
                      setEditingColorSlot(null);
                      setIsShortcutsOpen((prev) => !prev);
                    }}
                    title="اختصارات لوحة المفاتيح (?)"
                    aria-label="اختصارات لوحة المفاتيح"
                  >
                    <Keyboard className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                  </button>

                  <AnimatePresence>
                    {isShortcutsOpen && (
                      <motion.div
                        className="apple-shortcuts-popover"
                        dir="rtl"
                        role="dialog"
                        aria-label="اختصارات منظومة الأقلام"
                        initial={{
                          opacity: 0,
                          x: popoverAxisOffset.x * 0.5,
                          y: popoverAxisOffset.y * 0.5,
                          scale: 0.97,
                        }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          y: 0,
                          scale: 1,
                          transition: APPLE_POPOVER_SPRING,
                        }}
                        exit={{
                          opacity: 0,
                          x: popoverAxisOffset.x * 0.3,
                          y: popoverAxisOffset.y * 0.3,
                          scale: 0.98,
                          transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
                        }}
                      >
                        <div className="apple-shortcuts-header">
                          <span className="apple-shortcuts-title">اختصارات الأقلام والشريط</span>
                          <button
                            type="button"
                            className="apple-shortcuts-close"
                            onClick={() => setIsShortcutsOpen(false)}
                            aria-label="إغلاق دليل الاختصارات"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <div className="apple-shortcuts-section">
                          <div className="apple-dock-settings-group-title">الأدوات السريعة</div>
                          <div className="apple-shortcuts-grid">
                            <div className="apple-shortcut-row">
                              <span>قلم حبر</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">P</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>قلم رصاص</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">G</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>تظليل أبل</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">H</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>ممحاة ذكية</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">E</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>تبديل الممحاة</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">X</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>ليزر ضوئي</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">L</kbd>
                            </div>
                            {systemSettings.enabledOptionalTools.fountain && (
                              <div className="apple-shortcut-row">
                                <span>قلم خطّاط</span>
                                <kbd className="apple-shortcut-kbd" dir="ltr">F</kbd>
                              </div>
                            )}
                            {systemSettings.enabledOptionalTools.tape && (
                              <div className="apple-shortcut-row">
                                <span>شريط التحفيظ</span>
                                <kbd className="apple-shortcut-kbd" dir="ltr">T</kbd>
                              </div>
                            )}
                            {systemSettings.enabledOptionalTools.lasso && (
                              <div className="apple-shortcut-row">
                                <span>تحديد حر</span>
                                <kbd className="apple-shortcut-kbd" dir="ltr">S</kbd>
                              </div>
                            )}
                            <div className="apple-shortcut-row">
                              <span>وضع التصفح</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">V</kbd>
                            </div>
                          </div>
                        </div>

                        <div className="apple-dock-settings-divider" aria-hidden="true" />

                        <div className="apple-shortcuts-section">
                          <div className="apple-dock-settings-group-title">السُمك والألوان</div>
                          <div className="apple-shortcuts-list">
                            <div className="apple-shortcut-row">
                              <span>خانات السُمك الثلاث</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">1 / 2 / 3</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>تصغير وتكبير السُمك</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">[ / ]</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>تبديل اللون السريع</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">C</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>اختيار خانة اللون</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">Shift+1..3</kbd>
                            </div>
                          </div>
                        </div>

                        <div className="apple-dock-settings-divider" aria-hidden="true" />

                        <div className="apple-shortcuts-section">
                          <div className="apple-dock-settings-group-title">التحكم والنافذة العائمة</div>
                          <div className="apple-shortcuts-list">
                            <div className="apple-shortcut-row">
                              <span>تراجع / إعادة خطوة</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">Ctrl+Z / Y</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>تكرار / حذف المحدد</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">Ctrl+D / Del</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>إظهار / طيّ الشريط</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">D</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>نقل موضع الشريط</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">Shift+D</kbd>
                            </div>
                            <div className="apple-shortcut-row">
                              <span>إغلاق / إلغاء التحديد</span>
                              <kbd className="apple-shortcut-kbd" dir="ltr">Esc</kbd>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="apple-dock-settings-wrap">
                  <button
                    type="button"
                    className={`apple-icon-btn ${isDockSettingsOpen ? 'is-active-utility' : ''}`}
                    aria-expanded={isDockSettingsOpen}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setIsInspectorOpen(false);
                      setIsShortcutsOpen(false);
                      setEditingSlot(null);
                      setEditingColorSlot(null);
                      setIsDockSettingsOpen((prev) => !prev);
                    }}
                    title="إعدادات الأقلام والأدوات"
                    aria-label="إعدادات الأقلام والأدوات"
                  >
                    <Settings className="w-4 h-4" strokeWidth={1.9} aria-hidden="true" />
                  </button>

                  <AnimatePresence>
                    {isDockSettingsOpen && (
                      <motion.div
                        className="apple-dock-settings-popover"
                        dir="rtl"
                        role="dialog"
                        aria-label="إعدادات منظومة الأقلام"
                        initial={{ opacity: 0, x: popoverAxisOffset.x * 0.5, y: popoverAxisOffset.y * 0.5, scale: 0.97 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          y: 0,
                          scale: 1,
                          transition: APPLE_POPOVER_SPRING,
                        }}
                        exit={{
                          opacity: 0,
                          x: popoverAxisOffset.x * 0.3,
                          y: popoverAxisOffset.y * 0.3,
                          scale: 0.98,
                          transition: { duration: 0.12, ease: APPLE_EXIT_EASE },
                        }}
                      >
                        <div className="apple-dock-settings-group">
                          <div className="apple-dock-settings-group-title">سلوك الأقلام</div>
                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">ضبط الأشكال</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.smartShapes}
                              aria-label="ضبط الأشكال التلقائي لجميع الأقلام"
                              className={`apple-switch ${systemSettings.smartShapes ? 'is-on' : ''}`}
                              onClick={() =>
                                updateSystemSettings({ smartShapes: !systemSettings.smartShapes })
                              }
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>

                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">شطب للمسح السريع</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.scribbleErase}
                              aria-label="شطب للمسح السريع لجميع الأقلام"
                              className={`apple-switch ${systemSettings.scribbleErase ? 'is-on' : ''}`}
                              onClick={() =>
                                updateSystemSettings({ scribbleErase: !systemSettings.scribbleErase })
                              }
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>

                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">تصغير تلقائي أثناء الرسم</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.autoMinimizeWhileDrawing}
                              aria-label="تصغير الشريط تلقائياً للكرة أثناء الرسم"
                              className={`apple-switch ${
                                systemSettings.autoMinimizeWhileDrawing ? 'is-on' : ''
                              }`}
                              onClick={() =>
                                updateSystemSettings({
                                  autoMinimizeWhileDrawing: !systemSettings.autoMinimizeWhileDrawing,
                                })
                              }
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>
                        </div>

                        <div className="apple-dock-settings-divider" aria-hidden="true" />

                        <div className="apple-dock-settings-group">
                          <div className="apple-dock-settings-group-title">أدوات إضافية في الشريط</div>
                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">قلم خطّاط</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.enabledOptionalTools.fountain}
                              aria-label="إظهار قلم خطّاط في الشريط"
                              className={`apple-switch ${
                                systemSettings.enabledOptionalTools.fountain ? 'is-on' : ''
                              }`}
                              onClick={() => toggleOptionalTool('fountain')}
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>

                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">شريط التحفيظ</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.enabledOptionalTools.tape}
                              aria-label="إظهار شريط التحفيظ في الشريط"
                              className={`apple-switch ${
                                systemSettings.enabledOptionalTools.tape ? 'is-on' : ''
                              }`}
                              onClick={() => toggleOptionalTool('tape')}
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>

                          <div className="apple-inspector-toggle-row">
                            <span className="apple-toggle-title">التحديد الحر (لاسو)</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={systemSettings.enabledOptionalTools.lasso}
                              aria-label="إظهار أداة التحديد الحر في الشريط"
                              className={`apple-switch ${
                                systemSettings.enabledOptionalTools.lasso ? 'is-on' : ''
                              }`}
                              onClick={() => toggleOptionalTool('lasso')}
                            >
                              <span className="apple-switch-knob" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  className="apple-icon-btn is-collapse"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const { vw, vh } = getLayoutViewport();
                      const mode = dockPlacementRef.current.mode;
                      const dims = getDimsForMode(mode, vw, vh);
                      const targetSide: 'left' | 'right' =
                        mode === 'left' ? 'left' : mode === 'right' ? 'right' : orbPosRef.current.side;
                      collapseDockIntoCornerOrb({
                        targetSide,
                        dims,
                        orbCxOnDock: dockX.get() + dims.w * 0.5,
                        orbCyOnDock: dockY.get() + dims.h * 0.5,
                        vw,
                        vh,
                        fromDrag: false,
                      });
                      return;
                    }
                    setPaletteOpen(false);
                  }}
                  title="طيّ شريط الأقلام في كرة الاختصارات (D)"
                  aria-label="طيّ شريط الأقلام"
                >
                  <ChevronDown
                    className="w-4 h-4 transition-transform duration-200"
                    style={{
                      transform:
                        effectiveDockMode === 'left'
                          ? 'rotate(90deg)'
                          : effectiveDockMode === 'right'
                          ? 'rotate(-90deg)'
                          : 'rotate(0deg)',
                    }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              </div>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* In-place morphed 58x58 orb emerging directly from the condensing bar */}
            <motion.div
              className={`apple-dock-orb-shell ${activeTool !== 'cursor' ? 'has-active-tool' : ''}`}
              aria-hidden="true"
              style={{
                x: dockOrbShellX,
                y: dockOrbShellY,
                opacity: dockOrbCoreOpacity,
                ...(activeTool !== 'cursor'
                  ? ({
                      '--orb-accent':
                        activeTool === 'eraser'
                          ? eraserSettings.highlighterOnly
                            ? '#F59E0B'
                            : '#E11D48'
                          : activeTool === 'lasso'
                          ? '#007AFF'
                          : activeTool === 'fountain'
                          ? fountainSettings.color
                          : activeTool === 'pencil'
                          ? pencilSettings.color
                          : activeTool === 'highlighter'
                          ? highlighterSettings.color
                          : activeTool === 'tape'
                          ? tapeSettings.color
                          : activeTool === 'laser'
                          ? laserSettings.color
                          : penSettings.color,
                    } as React.CSSProperties)
                  : {}),
              }}
            >
              <AppleOrbLiveTool
                activeTool={activeTool}
                penColor={penSettings.color}
                penSizeLevel={penSizeLevel}
                fountainColor={fountainSettings.color}
                fountainSizeLevel={fountainSizeLevel}
                pencilColor={pencilSettings.color}
                pencilSizeLevel={pencilSizeLevel}
                highlighterColor={highlighterSettings.color}
                highlighterSizeLevel={highlighterSizeLevel}
                tapeColor={tapeSettings.color}
                tapeSizeLevel={tapeSizeLevel}
                laserColor={laserSettings.color}
                laserSizeLevel={pxToLaserSizeLevel(laserSettings.size)}
                eraserSizeLevel={eraserSizeLevel}
                eraserHighlighterOnly={Boolean(eraserSettings.highlighterOnly)}
              />
            </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
};
