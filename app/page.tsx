"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

const WORLD_W = 1200;
const WORLD_H = 720;
const CELL_W = 82;
const CELL_H = 72;
const CELL_GAP = 9;
const CELL_DEPTH = 14;

type ArrayItem = {
  id: string;
  kind: "array";
  x: number;
  y: number;
  label: string;
  values: number[];
  accent: string;
};

type PointerItem = {
  id: string;
  kind: "pointer";
  arrayId: string;
  index: number;
  label: string;
  color: string;
  side: "above" | "below";
};

type NumberItem = {
  id: string;
  kind: "number";
  x: number;
  y: number;
  value: number;
  color: string;
};

type StackItem = {
  id: string;
  kind: "stack";
  x: number;
  y: number;
  label: string;
  values: number[];
  accent: string;
};

type QueueItem = {
  id: string;
  kind: "queue";
  x: number;
  y: number;
  label: string;
  values: number[];
  accent: string;
};

type NoteItem = {
  id: string;
  kind: "note";
  x: number;
  y: number;
  title: string;
  body: string;
  color: string;
};

type NodeItem = {
  id: string;
  kind: "node";
  x: number;
  y: number;
  value: number;
  label: string;
  color: string;
  links: string[];
};

type SceneItem =
  | ArrayItem
  | PointerItem
  | NumberItem
  | StackItem
  | QueueItem
  | NoteItem
  | NodeItem;

type Selection = { id: string; subIndex?: number } | null;
type Point = { x: number; y: number };
type Hit = {
  id: string;
  part: "pointer" | "cell" | "handle" | "body";
  index?: number;
};
type DragState = {
  id: string;
  mode: "pointer" | "array-value" | "object";
  start: Point;
  startScene: SceneItem[];
  originIndex?: number;
  originalX?: number;
  originalY?: number;
  moved: boolean;
};
type ActionEntry = {
  id: number;
  title: string;
  detail: string;
  tone: "mint" | "amber" | "violet";
};

const INITIAL_SCENE: SceneItem[] = [
  {
    id: "array-main",
    kind: "array",
    x: 126,
    y: 272,
    label: "nums",
    values: [4, 11, 7, 2, 9, 5, 8, 3],
    accent: "#b8f455",
  },
  {
    id: "pointer-left",
    kind: "pointer",
    arrayId: "array-main",
    index: 1,
    label: "left",
    color: "#b8f455",
    side: "above",
  },
  {
    id: "pointer-right",
    kind: "pointer",
    arrayId: "array-main",
    index: 6,
    label: "right",
    color: "#ffbe55",
    side: "below",
  },
  {
    id: "note-goal",
    kind: "note",
    x: 845,
    y: 112,
    title: "DRY-RUN GOAL",
    body: "Find a pair that sums to 12. Move the pointers yourself.",
    color: "#a78bfa",
  },
  {
    id: "number-target",
    kind: "number",
    x: 988,
    y: 397,
    value: 12,
    color: "#ffbe55",
  },
];

const PALETTE = ["#b8f455", "#ffbe55", "#a78bfa", "#58d9ff", "#ff738b"];

function copyScene(scene: SceneItem[]): SceneItem[] {
  return scene.map((item) => {
    if (item.kind === "array" || item.kind === "stack" || item.kind === "queue") {
      return { ...item, values: [...item.values] };
    }
    if (item.kind === "node") return { ...item, links: [...item.links] };
    return { ...item };
  });
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const r = clamp(((value >> 16) & 255) + amount, 0, 255);
  const g = clamp(((value >> 8) & 255) + amount, 0, 255);
  const b = clamp((value & 255) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function findArray(scene: SceneItem[], id: string) {
  return scene.find((item): item is ArrayItem => item.id === id && item.kind === "array");
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(145, 179, 167, .075)";
  for (let x = -520; x < WORLD_W + 520; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + WORLD_H * 0.58, WORLD_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - WORLD_H * 0.58, WORLD_H);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(580, 340, 30, 580, 340, 620);
  glow.addColorStop(0, "rgba(80, 220, 177, .055)");
  glow.addColorStop(1, "rgba(3, 11, 14, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();
}

function drawCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  accent: string,
  selected = false,
  faded = false,
) {
  ctx.save();
  ctx.globalAlpha = faded ? 0.42 : 1;
  ctx.shadowColor = selected ? rgba(accent, 0.55) : "rgba(0,0,0,.38)";
  ctx.shadowBlur = selected ? 24 : 18;
  ctx.shadowOffsetY = selected ? 0 : 12;

  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width + depth * 0.55, y + height + depth * 0.55);
  ctx.lineTo(x + depth * 0.55, y + height + depth * 0.55);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -105);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.moveTo(x + width, y);
  ctx.lineTo(x + width + depth * 0.55, y + depth * 0.55);
  ctx.lineTo(x + width + depth * 0.55, y + height + depth * 0.55);
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -72);
  ctx.fill();

  const top = ctx.createLinearGradient(x, y, x + width, y + height);
  top.addColorStop(0, selected ? rgba(accent, 0.3) : "#182428");
  top.addColorStop(1, selected ? rgba(accent, 0.15) : "#10191d");
  rounded(ctx, x, y, width, height, 10);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.lineWidth = selected ? 2.3 : 1.15;
  ctx.strokeStyle = selected ? accent : "rgba(180, 210, 201, .19)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 12, y + 1);
  ctx.lineTo(x + width - 12, y + 1);
  ctx.strokeStyle = rgba(accent, selected ? 0.72 : 0.24);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawArray(
  ctx: CanvasRenderingContext2D,
  item: ArrayItem,
  selection: Selection,
  hoverIndex: number | null,
  draggingValue: boolean,
) {
  const totalW = item.values.length * CELL_W + Math.max(0, item.values.length - 1) * CELL_GAP;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.44)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 22;
  rounded(ctx, item.x - 22, item.y - 18, totalW + 54, CELL_H + 84, 24);
  ctx.fillStyle = "rgba(5, 13, 16, .58)";
  ctx.fill();
  ctx.restore();

  rounded(ctx, item.x, item.y - 50, 118, 30, 15);
  ctx.fillStyle = "rgba(12, 24, 27, .96)";
  ctx.fill();
  ctx.strokeStyle = rgba(item.accent, 0.33);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = item.accent;
  ctx.font = "700 10px Geist Mono, monospace";
  ctx.letterSpacing = "1px";
  ctx.fillText("⠿  ARRAY", item.x + 13, item.y - 31);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(222, 241, 234, .62)";
  ctx.font = "600 11px Geist, sans-serif";
  ctx.fillText(item.label, item.x + 130, item.y - 31);

  item.values.forEach((value, index) => {
    const x = item.x + index * (CELL_W + CELL_GAP);
    const isSelected = selection?.id === item.id && selection.subIndex === index;
    const isHover = hoverIndex === index && draggingValue;
    drawCube(ctx, x, item.y, CELL_W, CELL_H, CELL_DEPTH, isHover ? "#58d9ff" : item.accent, isSelected || isHover, draggingValue && isSelected);
    ctx.fillStyle = isHover ? "#bcefff" : "#f2f8f5";
    ctx.font = "650 25px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), x + CELL_W / 2, item.y + CELL_H / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "600 10px Geist Mono, monospace";
    ctx.fillStyle = isHover ? "#58d9ff" : "rgba(185, 210, 202, .45)";
    ctx.fillText(String(index).padStart(2, "0"), x + CELL_W / 2 - 6, item.y + CELL_H + CELL_DEPTH + 23);
  });

  ctx.fillStyle = "rgba(196, 219, 211, .34)";
  ctx.font = "600 9px Geist Mono, monospace";
  ctx.fillText(`${item.values.length} CELLS`, item.x + totalW - 42, item.y - 31);
}

function pointerGeometry(item: PointerItem, scene: SceneItem[]) {
  const array = findArray(scene, item.arrayId);
  if (!array || array.values.length === 0) return null;
  const safeIndex = clamp(item.index, 0, array.values.length - 1);
  const centerX = array.x + safeIndex * (CELL_W + CELL_GAP) + CELL_W / 2;
  const width = Math.max(72, item.label.length * 8 + 38);
  const pillY = item.side === "above" ? array.y - 115 : array.y + CELL_H + CELL_DEPTH + 48;
  const tipY = item.side === "above" ? array.y - 8 : array.y + CELL_H + CELL_DEPTH + 8;
  return { array, centerX, width, pillY, tipY, safeIndex };
}

function drawPointer(
  ctx: CanvasRenderingContext2D,
  item: PointerItem,
  scene: SceneItem[],
  selected: boolean,
) {
  const geometry = pointerGeometry(item, scene);
  if (!geometry) return;
  const { centerX, width, pillY, tipY, safeIndex } = geometry;
  const pillX = centerX - width / 2;
  const lineStart = item.side === "above" ? pillY + 32 : pillY;
  const lineEnd = item.side === "above" ? tipY - 9 : tipY + 9;

  ctx.save();
  ctx.shadowColor = rgba(item.color, selected ? 0.7 : 0.34);
  ctx.shadowBlur = selected ? 24 : 12;
  ctx.strokeStyle = item.color;
  ctx.lineWidth = selected ? 2.4 : 1.6;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(centerX, lineStart);
  ctx.lineTo(centerX, lineEnd);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  if (item.side === "above") {
    ctx.moveTo(centerX, tipY);
    ctx.lineTo(centerX - 8, tipY - 12);
    ctx.lineTo(centerX + 8, tipY - 12);
  } else {
    ctx.moveTo(centerX, tipY);
    ctx.lineTo(centerX - 8, tipY + 12);
    ctx.lineTo(centerX + 8, tipY + 12);
  }
  ctx.closePath();
  ctx.fillStyle = item.color;
  ctx.fill();

  rounded(ctx, pillX, pillY, width, 32, 16);
  ctx.fillStyle = selected ? item.color : "rgba(10, 22, 25, .97)";
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = item.color;
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = selected ? "#071013" : item.color;
  ctx.font = "750 11px Geist Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${item.label}  ·  ${safeIndex}`, centerX, pillY + 16);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawNumber(ctx: CanvasRenderingContext2D, item: NumberItem, selected: boolean) {
  ctx.save();
  const radius = 41;
  ctx.shadowColor = rgba(item.color, selected ? 0.72 : 0.34);
  ctx.shadowBlur = selected ? 34 : 20;
  ctx.shadowOffsetY = 10;
  const gradient = ctx.createRadialGradient(item.x - 13, item.y - 15, 3, item.x, item.y, radius);
  gradient.addColorStop(0, shade(item.color, 55));
  gradient.addColorStop(0.23, item.color);
  gradient.addColorStop(1, shade(item.color, -105));
  ctx.beginPath();
  ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#fff" : rgba(item.color, 0.78);
  ctx.stroke();
  ctx.fillStyle = "#071013";
  ctx.font = "800 24px Geist, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(item.value), item.x, item.y + 1);
  ctx.fillStyle = "rgba(225, 239, 234, .45)";
  ctx.font = "700 9px Geist Mono, monospace";
  ctx.fillText("NUMBER", item.x, item.y + 61);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawStack(ctx: CanvasRenderingContext2D, item: StackItem, selected: boolean) {
  ctx.save();
  ctx.fillStyle = "rgba(218, 237, 230, .48)";
  ctx.font = "700 10px Geist Mono, monospace";
  ctx.fillText(`⠿  ${item.label.toUpperCase()} / TOP`, item.x, item.y - item.values.length * 49 - 17);
  [...item.values].reverse().forEach((value, reverseIndex) => {
    const y = item.y - (reverseIndex + 1) * 49;
    drawCube(ctx, item.x, y, 104, 40, 10, item.accent, selected && reverseIndex === 0);
    ctx.fillStyle = "#edf6f2";
    ctx.font = "700 17px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(value), item.x + 52, y + 26);
    ctx.textAlign = "left";
  });
  ctx.strokeStyle = rgba(item.accent, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(item.x - 10, item.y - 5);
  ctx.lineTo(item.x + 122, item.y - 5);
  ctx.stroke();
  ctx.restore();
}

function drawQueue(ctx: CanvasRenderingContext2D, item: QueueItem, selected: boolean) {
  ctx.save();
  ctx.fillStyle = "rgba(218, 237, 230, .48)";
  ctx.font = "700 10px Geist Mono, monospace";
  ctx.fillText(`⠿  ${item.label.toUpperCase()}`, item.x, item.y - 22);
  item.values.forEach((value, index) => {
    const x = item.x + index * 68;
    drawCube(ctx, x, item.y, 59, 52, 10, item.accent, selected && index === 0);
    ctx.fillStyle = "#edf6f2";
    ctx.font = "700 16px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(value), x + 29, item.y + 32);
    ctx.textAlign = "left";
  });
  ctx.fillStyle = item.accent;
  ctx.font = "700 9px Geist Mono, monospace";
  ctx.fillText("FRONT", item.x, item.y + 78);
  ctx.fillText("BACK", item.x + Math.max(0, item.values.length * 68 - 37), item.y + 78);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = test;
  });
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function drawNote(ctx: CanvasRenderingContext2D, item: NoteItem, selected: boolean) {
  ctx.save();
  ctx.shadowColor = selected ? rgba(item.color, 0.48) : "rgba(0,0,0,.34)";
  ctx.shadowBlur = selected ? 28 : 20;
  ctx.shadowOffsetY = 12;
  rounded(ctx, item.x, item.y, 250, 126, 18);
  ctx.fillStyle = "rgba(14, 25, 29, .96)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? item.color : "rgba(180, 211, 201, .18)";
  ctx.stroke();
  rounded(ctx, item.x, item.y, 7, 126, 4);
  ctx.fillStyle = item.color;
  ctx.fill();
  ctx.fillStyle = item.color;
  ctx.font = "750 10px Geist Mono, monospace";
  ctx.letterSpacing = "1.1px";
  ctx.fillText(`⠿  ${item.title}`, item.x + 24, item.y + 29);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(232, 242, 238, .72)";
  ctx.font = "500 14px Geist, sans-serif";
  const lines = wrapText(ctx, item.body, 202);
  lines.forEach((line, index) => ctx.fillText(line, item.x + 24, item.y + 59 + index * 20));
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  source: NodeItem,
  target: NodeItem,
  color: string,
) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const startX = source.x + Math.cos(angle) * 50;
  const startY = source.y + Math.sin(angle) * 35;
  const endX = target.x - Math.cos(angle) * 55;
  const endY = target.y - Math.sin(angle) * 38;
  const curve = Math.min(70, Math.hypot(endX - startX, endY - startY) * 0.18);
  const controlX = (startX + endX) / 2 - Math.sin(angle) * curve;
  const controlY = (startY + endY) / 2 + Math.cos(angle) * curve;
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.68);
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(controlX, controlY, endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(endX, endY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-11, -6);
  ctx.lineTo(-11, 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawNode(ctx: CanvasRenderingContext2D, item: NodeItem, selected: boolean) {
  ctx.save();
  ctx.shadowColor = selected ? rgba(item.color, 0.64) : "rgba(0,0,0,.38)";
  ctx.shadowBlur = selected ? 28 : 17;
  ctx.shadowOffsetY = 11;
  rounded(ctx, item.x - 52, item.y - 36, 104, 72, 19);
  ctx.fillStyle = "#142126";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = selected ? item.color : rgba(item.color, 0.46);
  ctx.lineWidth = selected ? 2.5 : 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(item.x + 22, item.y - 35);
  ctx.lineTo(item.x + 22, item.y + 35);
  ctx.strokeStyle = rgba(item.color, 0.36);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#f1f7f4";
  ctx.font = "750 21px Geist, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(item.value), item.x - 14, item.y + 1);
  ctx.fillStyle = item.color;
  ctx.font = "800 18px Geist Mono, monospace";
  ctx.fillText(item.links.length ? "↗" : "·", item.x + 37, item.y + 1);
  ctx.fillStyle = "rgba(210, 230, 223, .48)";
  ctx.font = "700 9px Geist Mono, monospace";
  ctx.fillText(item.label.toUpperCase(), item.x, item.y + 55);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneItem[],
  selection: Selection,
  hoverIndex: number | null,
  dragGhost: { value: number; x: number; y: number } | null,
  connectionFrom: string | null,
) {
  drawGrid(ctx);
  const nodes = scene.filter((item): item is NodeItem => item.kind === "node");
  nodes.forEach((node) => {
    node.links.forEach((targetId) => {
      const target = nodes.find((candidate) => candidate.id === targetId);
      if (target) drawArrow(ctx, node, target, node.color);
    });
  });

  scene.forEach((item) => {
    const selected = selection?.id === item.id;
    if (item.kind === "array") {
      drawArray(ctx, item, selection, hoverIndex, Boolean(dragGhost && selection?.id === item.id));
    } else if (item.kind === "number") drawNumber(ctx, item, selected);
    else if (item.kind === "stack") drawStack(ctx, item, selected);
    else if (item.kind === "queue") drawQueue(ctx, item, selected);
    else if (item.kind === "note") drawNote(ctx, item, selected);
    else if (item.kind === "node") drawNode(ctx, item, selected || connectionFrom === item.id);
  });
  scene.forEach((item) => {
    if (item.kind === "pointer") drawPointer(ctx, item, scene, selection?.id === item.id);
  });

  if (dragGhost) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = "rgba(88, 217, 255, .6)";
    ctx.shadowBlur = 28;
    rounded(ctx, dragGhost.x - 36, dragGhost.y - 32, 72, 64, 14);
    ctx.fillStyle = "#17292f";
    ctx.fill();
    ctx.strokeStyle = "#58d9ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#effcff";
    ctx.font = "750 23px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(dragGhost.value), dragGhost.x, dragGhost.y);
    ctx.restore();
  }
}

function inRect(point: Point, x: number, y: number, width: number, height: number) {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function hitTest(point: Point, scene: SceneItem[]): Hit | null {
  for (let index = scene.length - 1; index >= 0; index -= 1) {
    const item = scene[index];
    if (item.kind !== "pointer") continue;
    const geometry = pointerGeometry(item, scene);
    if (!geometry) continue;
    if (inRect(point, geometry.centerX - geometry.width / 2 - 8, geometry.pillY - 8, geometry.width + 16, 48)) {
      return { id: item.id, part: "pointer" };
    }
  }

  for (let index = scene.length - 1; index >= 0; index -= 1) {
    const item = scene[index];
    if (item.kind === "array") {
      if (inRect(point, item.x - 8, item.y - 58, 132, 45)) return { id: item.id, part: "handle" };
      for (let cell = 0; cell < item.values.length; cell += 1) {
        const x = item.x + cell * (CELL_W + CELL_GAP);
        if (inRect(point, x, item.y, CELL_W + CELL_DEPTH * 0.55, CELL_H + CELL_DEPTH)) {
          return { id: item.id, part: "cell", index: cell };
        }
      }
    } else if (item.kind === "number") {
      if (Math.hypot(point.x - item.x, point.y - item.y) <= 51) return { id: item.id, part: "body" };
    } else if (item.kind === "note") {
      if (inRect(point, item.x, item.y, 250, 126)) return { id: item.id, part: "body" };
    } else if (item.kind === "stack") {
      if (inRect(point, item.x - 10, item.y - item.values.length * 49 - 40, 135, item.values.length * 49 + 45)) {
        return { id: item.id, part: "body" };
      }
    } else if (item.kind === "queue") {
      if (inRect(point, item.x - 10, item.y - 40, Math.max(100, item.values.length * 68 + 20), 130)) {
        return { id: item.id, part: "body" };
      }
    } else if (item.kind === "node") {
      if (inRect(point, item.x - 62, item.y - 46, 124, 104)) return { id: item.id, part: "body" };
    }
  }
  return null;
}

function objectName(item: SceneItem | undefined) {
  if (!item) return "Object";
  if (item.kind === "array" || item.kind === "stack" || item.kind === "queue") return item.label;
  if (item.kind === "pointer") return `${item.label} pointer`;
  if (item.kind === "number") return `Number ${item.value}`;
  if (item.kind === "note") return item.title;
  return item.label;
}

function parseValues(value: string) {
  return value
    .split(/[ ,]+/)
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
    .slice(0, 12);
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="color-picker" aria-label="Color">
      {PALETTE.map((color) => (
        <button
          type="button"
          key={color}
          className={value === color ? "color-dot active" : "color-dot"}
          style={{ background: color }}
          onClick={() => onChange(color)}
          aria-label={`Use ${color}`}
        />
      ))}
    </div>
  );
}

type InspectorProps = {
  selected: SceneItem | undefined;
  arrays: ArrayItem[];
  nodes: NodeItem[];
  selection: Selection;
  connectFrom: string | null;
  onPatch: (patch: Partial<SceneItem>, message: string) => void;
  onDelete: () => void;
  onConnect: (id: string) => void;
  onClearLinks: (id: string) => void;
};

function Inspector({
  selected,
  arrays,
  nodes,
  selection,
  connectFrom,
  onPatch,
  onDelete,
  onConnect,
  onClearLinks,
}: InspectorProps) {
  if (!selected) {
    return (
      <div className="empty-inspector">
        <div className="orbital-mark"><span /></div>
        <p className="eyebrow">READY TO MANIPULATE</p>
        <h2>Select any object</h2>
        <p>Drag values to swap them. Drag pointer labels to snap them onto a new index.</p>
        <div className="shortcut-grid">
          <span><kbd>←</kbd><kbd>→</kbd> Move</span>
          <span><kbd>⌫</kbd> Delete</span>
          <span><kbd>⌘</kbd><kbd>Z</kbd> Undo</span>
          <span><kbd>Enter</kbd> Step</span>
        </div>
      </div>
    );
  }

  const label = selected.kind === "number" ? "NUMBER TOKEN" : selected.kind.toUpperCase();
  return (
    <div className="property-form">
      <div className="selection-heading">
        <span className="selection-icon">{selected.kind === "array" ? "[ ]" : selected.kind === "pointer" ? "↟" : selected.kind === "node" ? "◉" : "◆"}</span>
        <div>
          <p className="eyebrow">{label}</p>
          <h2>{objectName(selected)}</h2>
        </div>
      </div>

      {selected.kind === "array" && (
        <>
          <label className="field-label">Array name</label>
          <input
            key={`${selected.id}-${selected.label}`}
            className="field-input"
            defaultValue={selected.label}
            onBlur={(event) => event.target.value.trim() && onPatch({ label: event.target.value.trim() } as Partial<ArrayItem>, "Renamed the array")}
          />
          <label className="field-label">Values <span>comma separated</span></label>
          <textarea
            key={`${selected.id}-${selected.values.join("-")}`}
            className="field-input values-input"
            defaultValue={selected.values.join(", ")}
            onBlur={(event) => {
              const values = parseValues(event.target.value);
              if (values.length) onPatch({ values } as Partial<ArrayItem>, "Updated array values");
            }}
          />
          <p className="field-hint">Selected cell: {selection?.subIndex ?? "none"} · max 12 values</p>
          <label className="field-label">Accent</label>
          <ColorPicker value={selected.accent} onChange={(accent) => onPatch({ accent } as Partial<ArrayItem>, "Changed array accent")} />
        </>
      )}

      {selected.kind === "pointer" && (
        <>
          <label className="field-label">Pointer label</label>
          <input
            key={`${selected.id}-${selected.label}`}
            className="field-input"
            defaultValue={selected.label}
            onBlur={(event) => event.target.value.trim() && onPatch({ label: event.target.value.trim() } as Partial<PointerItem>, "Renamed the pointer")}
          />
          <label className="field-label">Attached array</label>
          <select className="field-input" value={selected.arrayId} onChange={(event) => onPatch({ arrayId: event.target.value, index: 0 } as Partial<PointerItem>, "Attached pointer to another array")}>
            {arrays.map((array) => <option key={array.id} value={array.id}>{array.label}</option>)}
          </select>
          <label className="field-label">Index <span>{selected.index}</span></label>
          <input
            className="range-input"
            type="range"
            min={0}
            max={Math.max(0, (arrays.find((array) => array.id === selected.arrayId)?.values.length ?? 1) - 1)}
            value={selected.index}
            onChange={(event) => onPatch({ index: Number(event.target.value) } as Partial<PointerItem>, `Moved ${selected.label} pointer`)}
          />
          <label className="field-label">Position</label>
          <div className="segmented">
            <button type="button" className={selected.side === "above" ? "active" : ""} onClick={() => onPatch({ side: "above" } as Partial<PointerItem>, "Moved pointer above")}>Above</button>
            <button type="button" className={selected.side === "below" ? "active" : ""} onClick={() => onPatch({ side: "below" } as Partial<PointerItem>, "Moved pointer below")}>Below</button>
          </div>
          <label className="field-label">Color</label>
          <ColorPicker value={selected.color} onChange={(color) => onPatch({ color } as Partial<PointerItem>, "Changed pointer color")} />
        </>
      )}

      {selected.kind === "number" && (
        <>
          <label className="field-label">Value</label>
          <input
            key={`${selected.id}-${selected.value}`}
            className="field-input large-value"
            type="number"
            defaultValue={selected.value}
            onBlur={(event) => onPatch({ value: Number(event.target.value) || 0 } as Partial<NumberItem>, "Changed number value")}
          />
          <label className="field-label">Color</label>
          <ColorPicker value={selected.color} onChange={(color) => onPatch({ color } as Partial<NumberItem>, "Changed number color")} />
        </>
      )}

      {(selected.kind === "stack" || selected.kind === "queue") && (
        <>
          <label className="field-label">Structure name</label>
          <input
            key={`${selected.id}-${selected.label}`}
            className="field-input"
            defaultValue={selected.label}
            onBlur={(event) => event.target.value.trim() && onPatch({ label: event.target.value.trim() } as Partial<StackItem | QueueItem>, "Renamed structure")}
          />
          <label className="field-label">Values <span>{selected.kind === "stack" ? "bottom → top" : "front → back"}</span></label>
          <textarea
            key={`${selected.id}-${selected.values.join("-")}`}
            className="field-input values-input"
            defaultValue={selected.values.join(", ")}
            onBlur={(event) => {
              const values = parseValues(event.target.value);
              if (values.length) onPatch({ values } as Partial<StackItem | QueueItem>, `Updated ${selected.kind}`);
            }}
          />
          <label className="field-label">Accent</label>
          <ColorPicker value={selected.accent} onChange={(accent) => onPatch({ accent } as Partial<StackItem | QueueItem>, "Changed structure accent")} />
        </>
      )}

      {selected.kind === "note" && (
        <>
          <label className="field-label">Heading</label>
          <input
            key={`${selected.id}-${selected.title}`}
            className="field-input"
            defaultValue={selected.title}
            onBlur={(event) => event.target.value.trim() && onPatch({ title: event.target.value.trim() } as Partial<NoteItem>, "Updated note heading")}
          />
          <label className="field-label">Note</label>
          <textarea
            key={`${selected.id}-${selected.body}`}
            className="field-input note-input"
            defaultValue={selected.body}
            onBlur={(event) => onPatch({ body: event.target.value } as Partial<NoteItem>, "Updated dry-run note")}
          />
          <label className="field-label">Color</label>
          <ColorPicker value={selected.color} onChange={(color) => onPatch({ color } as Partial<NoteItem>, "Changed note color")} />
        </>
      )}

      {selected.kind === "node" && (
        <>
          <label className="field-label">Node label</label>
          <input
            key={`${selected.id}-${selected.label}`}
            className="field-input"
            defaultValue={selected.label}
            onBlur={(event) => event.target.value.trim() && onPatch({ label: event.target.value.trim() } as Partial<NodeItem>, "Renamed node")}
          />
          <label className="field-label">Value</label>
          <input
            key={`${selected.id}-${selected.value}`}
            className="field-input"
            type="number"
            defaultValue={selected.value}
            onBlur={(event) => onPatch({ value: Number(event.target.value) || 0 } as Partial<NodeItem>, "Changed node value")}
          />
          <button type="button" className={connectFrom === selected.id ? "connect-button active" : "connect-button"} onClick={() => onConnect(selected.id)}>
            <span>↗</span>{connectFrom === selected.id ? "Choose a target node…" : "Connect to another node"}
          </button>
          {selected.links.length > 0 && (
            <button type="button" className="text-button" onClick={() => onClearLinks(selected.id)}>Remove {selected.links.length} connection{selected.links.length > 1 ? "s" : ""}</button>
          )}
          <p className="field-hint">{nodes.length} nodes on this board</p>
          <label className="field-label">Color</label>
          <ColorPicker value={selected.color} onChange={(color) => onPatch({ color } as Partial<NodeItem>, "Changed node color")} />
        </>
      )}

      <button type="button" className="delete-button" onClick={onDelete}>Delete selected object <span>⌫</span></button>
    </div>
  );
}

const TOOLS = [
  { kind: "array", icon: "[ ]", label: "Array" },
  { kind: "number", icon: "#", label: "Number" },
  { kind: "pointer", icon: "↟", label: "Pointer" },
  { kind: "node", icon: "◉", label: "Node" },
  { kind: "stack", icon: "▤", label: "Stack" },
  { kind: "queue", icon: "⇥", label: "Queue" },
  { kind: "note", icon: "Aa", label: "Note" },
] as const;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneItem[]>(copyScene(INITIAL_SCENE));
  const historyRef = useRef<SceneItem[][]>([]);
  const futureRef = useRef<SceneItem[][]>([]);
  const dragRef = useRef<DragState | null>(null);
  const actionIdRef = useRef(3);
  const [scene, setScene] = useState<SceneItem[]>(() => copyScene(INITIAL_SCENE));
  const [selection, setSelection] = useState<Selection>(null);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 900, height: 620, dpr: 1 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ value: number; x: number; y: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"inspect" | "trace">("inspect");
  const [historyTick, setHistoryTick] = useState(0);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionEntry[]>([
    { id: 2, title: "Pointers placed", detail: "left = 1 · right = 6", tone: "amber" },
    { id: 1, title: "Board ready", detail: "Two-pointer practice scene", tone: "mint" },
  ]);

  const updateScene = useCallback((next: SceneItem[]) => {
    sceneRef.current = next;
    setScene(next);
  }, []);

  const addAction = useCallback((title: string, detail: string, tone: ActionEntry["tone"] = "mint") => {
    actionIdRef.current += 1;
    setActions((current) => [{ id: actionIdRef.current, title, detail, tone }, ...current].slice(0, 24));
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1900);
  }, []);

  const refreshHistoryStatus = useCallback(() => {
    setHistoryStatus({
      canUndo: historyRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const commitScene = useCallback((next: SceneItem[], title: string, detail = "", tone: ActionEntry["tone"] = "mint") => {
    historyRef.current.push(copyScene(sceneRef.current));
    if (historyRef.current.length > 60) historyRef.current.shift();
    futureRef.current = [];
    updateScene(next);
    setHistoryTick((value) => value + 1);
    refreshHistoryStatus();
    addAction(title, detail, tone);
  }, [addAction, refreshHistoryStatus, updateScene]);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(copyScene(sceneRef.current));
    updateScene(copyScene(previous));
    setHistoryTick((value) => value + 1);
    refreshHistoryStatus();
    addAction("Undid last change", "Board moved one state back", "violet");
  }, [addAction, refreshHistoryStatus, updateScene]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(copyScene(sceneRef.current));
    updateScene(copyScene(next));
    setHistoryTick((value) => value + 1);
    refreshHistoryStatus();
    addAction("Redid change", "Board moved one state forward", "violet");
  }, [addAction, refreshHistoryStatus, updateScene]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      setDimensions({ width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => {
    const fit = Math.min(dimensions.width / WORLD_W, dimensions.height / WORLD_H);
    const scale = fit * zoom;
    return {
      scale,
      offsetX: (dimensions.width - WORLD_W * scale) / 2,
      offsetY: (dimensions.height - WORLD_H * scale) / 2,
    };
  }, [dimensions, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(dimensions.width * dimensions.dpr);
    canvas.height = Math.round(dimensions.height * dimensions.dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dimensions.dpr, 0, 0, dimensions.dpr, 0, 0);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.fillStyle = "#071013";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    ctx.setTransform(
      dimensions.dpr * transform.scale,
      0,
      0,
      dimensions.dpr * transform.scale,
      dimensions.dpr * transform.offsetX,
      dimensions.dpr * transform.offsetY,
    );
    drawScene(ctx, scene, selection, hoverIndex, dragGhost, connectFrom);
  }, [scene, selection, hoverIndex, dragGhost, connectFrom, dimensions, transform]);

  const worldPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - transform.offsetX) / transform.scale,
      y: (event.clientY - rect.top - transform.offsetY) / transform.scale,
    };
  }, [transform]);

  const finishConnection = useCallback((targetId: string) => {
    if (!connectFrom || connectFrom === targetId) {
      flash("Choose a different node as the target");
      return;
    }
    const source = sceneRef.current.find((item): item is NodeItem => item.id === connectFrom && item.kind === "node");
    const target = sceneRef.current.find((item): item is NodeItem => item.id === targetId && item.kind === "node");
    if (!source || !target) return;
    if (source.links.includes(targetId)) {
      setConnectFrom(null);
      flash("Those nodes are already connected");
      return;
    }
    const next = sceneRef.current.map((item) => item.id === source.id && item.kind === "node" ? { ...item, links: [...item.links, targetId] } : item);
    commitScene(next, "Connected two nodes", `${source.label} → ${target.label}`, "violet");
    setConnectFrom(null);
    setSelection({ id: targetId });
  }, [commitScene, connectFrom, flash]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus();
    const point = worldPoint(event);
    const hit = hitTest(point, sceneRef.current);
    if (connectFrom) {
      const item = hit ? sceneRef.current.find((entry) => entry.id === hit.id) : undefined;
      if (item?.kind === "node") finishConnection(item.id);
      else flash("Connection mode: select a target node");
      return;
    }
    if (!hit) {
      setSelection(null);
      return;
    }
    const item = sceneRef.current.find((entry) => entry.id === hit.id);
    if (!item) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit.part === "cell" && item.kind === "array" && hit.index !== undefined) {
      setSelection({ id: item.id, subIndex: hit.index });
      setDragGhost({ value: item.values[hit.index], x: point.x, y: point.y });
      setHoverIndex(hit.index);
      dragRef.current = {
        id: item.id,
        mode: "array-value",
        start: point,
        startScene: copyScene(sceneRef.current),
        originIndex: hit.index,
        moved: false,
      };
      return;
    }
    setSelection({ id: item.id });
    dragRef.current = {
      id: item.id,
      mode: item.kind === "pointer" ? "pointer" : "object",
      start: point,
      startScene: copyScene(sceneRef.current),
      originalX: "x" in item ? item.x : undefined,
      originalY: "y" in item ? item.y : undefined,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = worldPoint(event);
    const distance = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
    if (distance > 4) drag.moved = true;

    if (drag.mode === "array-value") {
      setDragGhost((ghost) => ghost ? { ...ghost, x: point.x, y: point.y } : ghost);
      const array = findArray(sceneRef.current, drag.id);
      if (!array) return;
      const relative = (point.x - array.x) / (CELL_W + CELL_GAP);
      const candidate = clamp(Math.round(relative - CELL_W / (2 * (CELL_W + CELL_GAP))), 0, array.values.length - 1);
      const withinY = point.y > array.y - 45 && point.y < array.y + CELL_H + 70;
      setHoverIndex(withinY ? candidate : null);
      return;
    }

    if (drag.mode === "pointer") {
      const pointer = sceneRef.current.find((item): item is PointerItem => item.id === drag.id && item.kind === "pointer");
      if (!pointer) return;
      const array = findArray(sceneRef.current, pointer.arrayId);
      if (!array || !array.values.length) return;
      const candidate = clamp(
        Math.round((point.x - array.x - CELL_W / 2) / (CELL_W + CELL_GAP)),
        0,
        array.values.length - 1,
      );
      if (candidate !== pointer.index) {
        updateScene(sceneRef.current.map((item) => item.id === pointer.id ? { ...pointer, index: candidate } : item));
      }
      return;
    }

    if (drag.mode === "object") {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      updateScene(sceneRef.current.map((item) => {
        if (item.id !== drag.id || !("x" in item) || !("y" in item)) return item;
        return {
          ...item,
          x: clamp((drag.originalX ?? item.x) + dx, 28, WORLD_W - 80),
          y: clamp((drag.originalY ?? item.y) + dy, 64, WORLD_H - 48),
        };
      }));
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (drag.mode === "array-value") {
      const array = findArray(sceneRef.current, drag.id);
      if (array && drag.originIndex !== undefined && hoverIndex !== null && hoverIndex !== drag.originIndex) {
        const values = [...array.values];
        const first = values[drag.originIndex];
        const second = values[hoverIndex];
        [values[drag.originIndex], values[hoverIndex]] = [values[hoverIndex], values[drag.originIndex]];
        historyRef.current.push(copyScene(drag.startScene));
        futureRef.current = [];
        updateScene(sceneRef.current.map((item) => item.id === array.id ? { ...array, values } : item));
        setSelection({ id: array.id, subIndex: hoverIndex });
        setHistoryTick((value) => value + 1);
        refreshHistoryStatus();
        addAction("Swapped array values", `${first} ↔ ${second} · indices ${drag.originIndex} and ${hoverIndex}`, "amber");
      }
    } else if (drag.moved) {
      historyRef.current.push(copyScene(drag.startScene));
      futureRef.current = [];
      setHistoryTick((value) => value + 1);
      refreshHistoryStatus();
      const item = sceneRef.current.find((entry) => entry.id === drag.id);
      if (item?.kind === "pointer") addAction("Moved a pointer", `${item.label} → index ${item.index}`, "amber");
      else addAction("Moved an object", objectName(item), "violet");
    }
    dragRef.current = null;
    setDragGhost(null);
    setHoverIndex(null);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setZoom((current) => clamp(current + (event.deltaY > 0 ? -0.08 : 0.08), 0.68, 1.65));
  };

  const selected = selection ? scene.find((item) => item.id === selection.id) : undefined;
  const arrays = scene.filter((item): item is ArrayItem => item.kind === "array");
  const nodes = scene.filter((item): item is NodeItem => item.kind === "node");

  const patchSelected = (patch: Partial<SceneItem>, message: string) => {
    if (!selection) return;
    const next = sceneRef.current.map((item) => item.id === selection.id ? { ...item, ...patch } as SceneItem : item);
    commitScene(next, message, objectName(selected), "violet");
  };

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    const item = sceneRef.current.find((entry) => entry.id === selection.id);
    if (!item) return;
    let next = sceneRef.current.filter((entry) => entry.id !== selection.id);
    if (item.kind === "array") next = next.filter((entry) => entry.kind !== "pointer" || entry.arrayId !== item.id);
    if (item.kind === "node") next = next.map((entry) => entry.kind === "node" ? { ...entry, links: entry.links.filter((id) => id !== item.id) } : entry);
    commitScene(next, "Deleted an object", objectName(item), "amber");
    setSelection(null);
    setConnectFrom(null);
  }, [commitScene, selection]);

  const addTool = (kind: typeof TOOLS[number]["kind"]) => {
    const count = sceneRef.current.length;
    const offset = (count % 5) * 28;
    let item: SceneItem | null = null;
    if (kind === "array") {
      item = { id: uid("array"), kind, x: 110 + offset, y: 195 + offset, label: `arr${arrays.length + 1}`, values: [6, 1, 8, 3, 9], accent: PALETTE[arrays.length % PALETTE.length] };
    } else if (kind === "number") {
      item = { id: uid("number"), kind, x: 650 + offset, y: 170 + offset, value: 42, color: "#ffbe55" };
    } else if (kind === "pointer") {
      const target = selected?.kind === "array" ? selected : arrays[0];
      if (!target) {
        flash("Add an array before adding a pointer");
        return;
      }
      const pointerCount = sceneRef.current.filter((entry) => entry.kind === "pointer").length;
      item = { id: uid("pointer"), kind, arrayId: target.id, index: 0, label: ["i", "j", "k", "mid"][pointerCount % 4], color: PALETTE[pointerCount % PALETTE.length], side: pointerCount % 2 ? "below" : "above" };
    } else if (kind === "stack") {
      item = { id: uid("stack"), kind, x: 820 - offset, y: 570, label: "stack", values: [2, 5, 8], accent: "#a78bfa" };
    } else if (kind === "queue") {
      item = { id: uid("queue"), kind, x: 400, y: 520 - offset, label: "queue", values: [3, 7, 1, 9], accent: "#58d9ff" };
    } else if (kind === "note") {
      item = { id: uid("note"), kind, x: 790 - offset, y: 90 + offset, title: "INVARIANT", body: "Write what must stay true at this step.", color: "#a78bfa" };
    } else if (kind === "node") {
      item = { id: uid("node"), kind, x: 450 + offset, y: 195 + offset, value: 7, label: `node ${nodes.length + 1}`, color: "#58d9ff", links: [] };
    }
    if (!item) return;
    commitScene([...sceneRef.current, item], `Added ${kind}`, objectName(item), "mint");
    setSelection({ id: item.id });
    setPanelTab("inspect");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Escape") {
      setConnectFrom(null);
      setSelection(null);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === "Enter") {
      addAction("Manual checkpoint", selected ? `Observed ${objectName(selected)}` : "Observed the board", "mint");
      return;
    }
    if (!selection || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const item = sceneRef.current.find((entry) => entry.id === selection.id);
    if (!item) return;
    if (item.kind === "pointer" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const array = findArray(sceneRef.current, item.arrayId);
      if (!array) return;
      const index = clamp(item.index + (event.key === "ArrowLeft" ? -1 : 1), 0, array.values.length - 1);
      if (index !== item.index) commitScene(sceneRef.current.map((entry) => entry.id === item.id ? { ...item, index } : entry), "Moved a pointer", `${item.label} → index ${index}`, "amber");
      return;
    }
    if (item.kind === "array" && selection.subIndex !== undefined && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const target = clamp(selection.subIndex + (event.key === "ArrowLeft" ? -1 : 1), 0, item.values.length - 1);
      if (target !== selection.subIndex) {
        const values = [...item.values];
        [values[selection.subIndex], values[target]] = [values[target], values[selection.subIndex]];
        commitScene(sceneRef.current.map((entry) => entry.id === item.id ? { ...item, values } : entry), "Swapped adjacent values", `indices ${selection.subIndex} and ${target}`, "amber");
        setSelection({ id: item.id, subIndex: target });
      }
      return;
    }
    if ("x" in item && "y" in item) {
      const step = event.shiftKey ? 30 : 10;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      commitScene(sceneRef.current.map((entry) => entry.id === item.id ? { ...item, x: clamp(item.x + dx, 28, WORLD_W - 80), y: clamp(item.y + dy, 64, WORLD_H - 48) } : entry), "Nudged an object", objectName(item), "violet");
    }
  };

  const resetBoard = () => {
    commitScene(copyScene(INITIAL_SCENE), "Reset the board", "Restored the two-pointer scene", "amber");
    setSelection(null);
    setConnectFrom(null);
    setZoom(1);
  };

  const saveBoard = () => {
    window.localStorage.setItem("dsa-dry-run-lab-v1", JSON.stringify(sceneRef.current));
    flash("Workspace saved on this device");
    addAction("Saved workspace", `${sceneRef.current.length} objects stored locally`, "mint");
  };

  const restoreBoard = () => {
    const saved = window.localStorage.getItem("dsa-dry-run-lab-v1");
    if (!saved) {
      flash("No saved workspace found");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as SceneItem[];
      commitScene(copyScene(parsed), "Restored workspace", `${parsed.length} objects loaded`, "mint");
      setSelection(null);
    } catch {
      flash("Saved workspace could not be read");
    }
  };

  const clearLinks = (id: string) => {
    const node = sceneRef.current.find((item): item is NodeItem => item.id === id && item.kind === "node");
    if (!node) return;
    commitScene(sceneRef.current.map((item) => item.id === id ? { ...node, links: [] } : item), "Cleared node links", node.label, "violet");
  };

  const markStep = () => {
    const item = selection ? sceneRef.current.find((entry) => entry.id === selection.id) : undefined;
    const detail = item?.kind === "pointer" ? `${item.label} = ${item.index}` : item ? `Observed ${objectName(item)}` : `Observed ${sceneRef.current.length} objects`;
    addAction(`Step ${actions.length + 1} marked`, detail, "mint");
    flash("Dry-run step added to trace");
  };

  return (
    <main className="lab-app">
      <header className="appbar">
        <div className="brand-block">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <div className="brand-line"><strong>DSA</strong><span>/</span>DRY RUN LAB</div>
            <p>Manual algorithm playground</p>
          </div>
        </div>
        <div className="session-chip"><span /> PRACTICE BOARD · LOCAL</div>
        <div className="app-actions">
          <button type="button" className="icon-action" onClick={undo} disabled={!historyStatus.canUndo} title="Undo" aria-label="Undo">↶</button>
          <button type="button" className="icon-action" onClick={redo} disabled={!historyStatus.canRedo} title="Redo" aria-label="Redo">↷</button>
          <button type="button" className="plain-action" onClick={restoreBoard}>Restore</button>
          <button type="button" className="save-action" onClick={saveBoard}><span>◇</span> Save workspace</button>
        </div>
      </header>

      <div className="workbench">
        <aside className="toolrail" aria-label="Object tools">
          <p className="rail-title">ADD</p>
          <div className="tool-list">
            {TOOLS.map((tool) => (
              <button type="button" className="tool-button" key={tool.kind} onClick={() => addTool(tool.kind)} title={`Add ${tool.label}`}>
                <span className="tool-icon">{tool.icon}</span>
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
          <div className="rail-spacer" />
          <button type="button" className="reset-tool" onClick={resetBoard} title="Reset board"><span>↺</span><small>Reset</small></button>
        </aside>

        <section className="canvas-shell" ref={shellRef} aria-label="DSA manipulation workspace">
          <canvas
            ref={canvasRef}
            className={connectFrom ? "lab-canvas connecting" : "lab-canvas"}
            data-testid="dsa-canvas"
            role="application"
            aria-label="Interactive DSA canvas. Drag array values to swap them and drag pointers to move between indices."
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
          />

          <div className="canvas-topline">
            <div className="mode-chip"><span className="mode-dot" /> SELECT & MOVE</div>
            <div className="scene-meta">SCENE 01 <span>·</span> {scene.length} OBJECTS</div>
          </div>

          {connectFrom && (
            <div className="connect-banner">
              <span>↗</span>
              <div><strong>Connection mode</strong><small>Select a target node · Esc to cancel</small></div>
              <button type="button" onClick={() => setConnectFrom(null)}>Cancel</button>
            </div>
          )}

          <div className="gesture-tip"><span>✦</span> Drag a number to swap · drag a pointer to snap</div>
          <div className="canvas-controls">
            <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.68, 1.65))} aria-label="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.68, 1.65))} aria-label="Zoom in">+</button>
            <i />
            <button type="button" onClick={() => setZoom(1)} className="fit-control">FIT</button>
          </div>
        </section>

        <aside className="inspector" aria-label="Object inspector and trace">
          <div className="panel-tabs">
            <button type="button" className={panelTab === "inspect" ? "active" : ""} onClick={() => setPanelTab("inspect")}>INSPECT</button>
            <button type="button" className={panelTab === "trace" ? "active" : ""} onClick={() => setPanelTab("trace")}>TRACE <span>{actions.length}</span></button>
          </div>
          <div className="panel-content">
            {panelTab === "inspect" ? (
              <Inspector
                selected={selected}
                arrays={arrays}
                nodes={nodes}
                selection={selection}
                connectFrom={connectFrom}
                onPatch={patchSelected}
                onDelete={deleteSelected}
                onConnect={(id) => setConnectFrom((current) => current === id ? null : id)}
                onClearLinks={clearLinks}
              />
            ) : (
              <div className="trace-panel">
                <div className="trace-heading">
                  <div>
                    <p className="eyebrow">MANUAL TRACE</p>
                    <h2>Your dry-run steps</h2>
                  </div>
                  <button type="button" onClick={markStep}>+ Mark step</button>
                </div>
                <textarea className="scratchpad" placeholder="Scratch note: condition, sum, invariant…" aria-label="Dry-run scratch note" />
                <div className="timeline">
                  {actions.map((action, index) => (
                    <article className="trace-row" key={action.id}>
                      <div className={`trace-dot ${action.tone}`}><span /></div>
                      <div>
                        <p><strong>{String(actions.length - index).padStart(2, "0")}</strong>{action.title}</p>
                        <small>{action.detail}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
          <footer className="inspector-footer">
            <span><i className="live-dot" /> AUTO-SAVED IN MEMORY</span>
            <button type="button" onClick={markStep}>MARK STEP <b>↵</b></button>
          </footer>
        </aside>
      </div>

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      <span className="sr-only" aria-live="polite">History state {historyTick}</span>
    </main>
  );
}
