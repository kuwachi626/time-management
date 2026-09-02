// --- 型定義 ---
export interface ScheduleItem {
	currentTimes: string;
	times: string;
	className: string;
	start: string;
	end: string;
	duration: string;
	startSec: number;
	endSec: number;
}

/**
 * base はCSV由来の不変データ。ずれは2種類のオフセットだけで表現する。
 * どちらも「変更した行以降が連動してずれる」が、前の行には影響しない。
 *
 *   shifts[i]  : 行 i の開始を後ろへずらす量（秒）。所要時間は変わらない
 *   stretch[i] : 行 i の所要時間を伸ばす量（秒）。開始は変わらない
 *
 *   行 i の開始オフセット = Σ_{k<=i} shifts[k] + Σ_{k<i} stretch[k]
 *   行 i の終了オフセット = 開始オフセット + stretch[i]
 */
export interface ScheduleState {
	version: 2;
	base: ScheduleItem[];
	shifts: number[];
	stretch: number[];
	fileName: string;
	importedAt: string;
}

export interface ParseResult {
	items: ScheduleItem[];
	skipped: number;
}

const STORAGE_KEY = "raceSchedule";
const DAY_SEC = 24 * 60 * 60;

// --- 時刻ヘルパー ---

/** "9:05" / "09:05:30" を秒に変換する。解釈できない場合は null。 */
export const timeToSeconds = (timeStr: string | undefined): number | null => {
	if (!timeStr) return null;
	const parts = timeStr.trim().split(":");
	if (parts.length < 2) return null;
	const h = Number(parts[0]);
	const m = Number(parts[1]);
	const s = parts.length > 2 ? Number(parts[2]) : 0;
	if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) {
		return null;
	}
	return h * 3600 + m * 60 + s;
};

/** 一日の中の秒に正規化する（表示用。判定用の値には使わない） */
export const secondsInDay = (sec: number): number =>
	((Math.round(sec) % DAY_SEC) + DAY_SEC) % DAY_SEC;

/** 表示用 "9:05"（CSVの表記に合わせて時は0埋めしない） */
export const secondsToTime = (sec: number): string => {
	const norm = secondsInDay(sec);
	return `${Math.floor(norm / 3600)}:${String(Math.floor((norm % 3600) / 60)).padStart(2, "0")}`;
};

/** <input type="time"> 用 "09:05" */
export const secondsToTimeInput = (sec: number): string => {
	const norm = secondsInDay(sec);
	const h = String(Math.floor(norm / 3600)).padStart(2, "0");
	const m = String(Math.floor((norm % 3600) / 60)).padStart(2, "0");
	return `${h}:${m}`;
};

/** 所要時間 "0:15"（日をまたぐ正規化はしない） */
export const formatSpan = (sec: number): string => {
	const total = Math.max(0, Math.round(sec));
	return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}`;
};

export const formatDuration = (totalSeconds: number): string => {
	if (totalSeconds <= 0) return "00:00:00";
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = Math.floor(totalSeconds % 60);
	return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

/** オフセットのバッジ表記 "+7分" / "-1分30秒" */
export const formatOffset = (sec: number): string => {
	const rounded = Math.round(sec);
	const sign = rounded < 0 ? "-" : "+";
	const abs = Math.abs(rounded);
	const m = Math.floor(abs / 60);
	const s = abs % 60;
	return s === 0 ? `${sign}${m}分` : `${sign}${m}分${s}秒`;
};

/** ずらす方向を含む差分。目標時刻に合わせるときに使う */
export const deltaTo = (currentSec: number, targetSec: number): number =>
	targetSec - secondsInDay(currentSec);

// --- オフセットの適用 ---

export const zeroOffsets = (length: number): number[] =>
	new Array(length).fill(0);

export const emptyState = (): ScheduleState => ({
	version: 2,
	base: [],
	shifts: [],
	stretch: [],
	fileName: "",
	importedAt: "",
});

export const hasAdjustments = (state: ScheduleState): boolean =>
	state.shifts.some((v) => v !== 0) || state.stretch.some((v) => v !== 0);

/** base に調整を適用した表示用の配列を生成する */
export const applyShifts = (state: ScheduleState): ScheduleItem[] => {
	let acc = 0;
	return state.base.map((item, i) => {
		acc += state.shifts[i] ?? 0;
		const startSec = item.startSec + acc;
		const stretch = state.stretch[i] ?? 0;
		const endSec = item.endSec + acc + stretch;
		// 伸びた分は次の行以降の開始にも波及させる
		acc += stretch;
		return {
			...item,
			start: secondsToTime(startSec),
			end: secondsToTime(endSec),
			// 所要時間が変わるのは stretch が入ったときだけ。
			// それ以外はCSVの走行時間をそのまま見せる
			duration: stretch === 0 ? item.duration : formatSpan(endSec - startSec),
			startSec,
			endSec,
		};
	});
};

/** 行 index の開始をずらす（所要時間は保ったまま、以降の行も連動） */
export const shiftStart = (
	state: ScheduleState,
	index: number,
	deltaSec: number,
): ScheduleState => {
	if (!Number.isFinite(deltaSec) || deltaSec === 0) return state;
	if (index < 0 || index >= state.base.length) return state;
	const shifts = [...state.shifts];
	shifts[index] = (shifts[index] ?? 0) + deltaSec;
	return { ...state, shifts };
};

/** 行 index の終了をずらす（その行の所要時間が変わり、以降の行も連動） */
export const shiftEnd = (
	state: ScheduleState,
	index: number,
	deltaSec: number,
): ScheduleState => {
	if (!Number.isFinite(deltaSec) || deltaSec === 0) return state;
	const item = state.base[index];
	if (!item) return state;
	const currentStretch = state.stretch[index] ?? 0;
	// 所要時間が負にならないようにする
	const minStretch = -(item.endSec - item.startSec);
	const nextStretch = Math.max(minStretch, currentStretch + deltaSec);
	if (nextStretch === currentStretch) return state;
	const stretch = [...state.stretch];
	stretch[index] = nextStretch;
	return { ...state, stretch };
};

export const resetAdjustments = (state: ScheduleState): ScheduleState => ({
	...state,
	shifts: zeroOffsets(state.base.length),
	stretch: zeroOffsets(state.base.length),
});

// --- CSVパース ---

const looksLikeDataRow = (fields: string[]): boolean =>
	fields.length >= 5 &&
	timeToSeconds(fields[3]) !== null &&
	timeToSeconds(fields[4]) !== null;

/** 6列CSV: currentTimes, times, className, start, end, duration */
export const parseCsv = (text: string): ParseResult => {
	const lines = text
		.replace(/^﻿/, "")
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "");
	if (lines.length === 0) return { items: [], skipped: 0 };

	const rows = lines.map((line) => line.split(","));
	// 1行目がデータ行として解釈できなければヘッダーとして捨てる
	const dataRows = looksLikeDataRow(rows[0]) ? rows : rows.slice(1);

	const items: ScheduleItem[] = [];
	let skipped = 0;

	for (const fields of dataRows) {
		const [currentTimes, times, className, start, end, duration] = fields;
		const startSec = timeToSeconds(start);
		const endSec = timeToSeconds(end);
		if (
			!currentTimes?.trim() ||
			!times?.trim() ||
			!className?.trim() ||
			startSec === null ||
			endSec === null
		) {
			skipped++;
			continue;
		}
		items.push({
			currentTimes: currentTimes.trim(),
			times: times.trim(),
			className: className.trim(),
			start: secondsToTime(startSec),
			end: secondsToTime(endSec),
			duration: duration?.trim() || formatSpan(endSec - startSec),
			startSec,
			endSec,
		});
	}

	items.sort((a, b) => a.startSec - b.startSec);
	return { items, skipped };
};

/** 読み込んだCSVから調整なしの状態を作る */
export const stateFromItems = (
	items: ScheduleItem[],
	fileName: string,
): ScheduleState => ({
	version: 2,
	base: items,
	shifts: zeroOffsets(items.length),
	stretch: zeroOffsets(items.length),
	fileName,
	importedAt: new Date().toISOString(),
});

// --- 永続化（移行つき） ---

const isScheduleItem = (value: unknown): value is ScheduleItem => {
	if (!value || typeof value !== "object") return false;
	const item = value as Partial<ScheduleItem>;
	return (
		typeof item.startSec === "number" &&
		typeof item.endSec === "number" &&
		Number.isFinite(item.startSec) &&
		Number.isFinite(item.endSec)
	);
};

const normalizeOffsets = (value: unknown, length: number): number[] => {
	const out = zeroOffsets(length);
	if (Array.isArray(value)) {
		for (let i = 0; i < length; i++) {
			const v: unknown = value[i];
			if (typeof v === "number" && Number.isFinite(v)) out[i] = v;
		}
	}
	return out;
};

export const loadState = (): ScheduleState => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return emptyState();
		const parsed: unknown = JSON.parse(raw);

		// 旧形式: ScheduleItem[] がそのまま入っている
		if (Array.isArray(parsed)) {
			const base = parsed.filter(isScheduleItem);
			return {
				...emptyState(),
				base,
				shifts: zeroOffsets(base.length),
				stretch: zeroOffsets(base.length),
			};
		}

		if (parsed && typeof parsed === "object") {
			const state = parsed as Partial<ScheduleState>;
			if (state.version === 2 && Array.isArray(state.base)) {
				const base = state.base.filter(isScheduleItem);
				return {
					version: 2,
					base,
					shifts: normalizeOffsets(state.shifts, base.length),
					stretch: normalizeOffsets(state.stretch, base.length),
					fileName:
						typeof state.fileName === "string" ? state.fileName : "",
					importedAt:
						typeof state.importedAt === "string"
							? state.importedAt
							: "",
				};
			}
		}
	} catch {
		// 壊れた値は無視して空で起動する（白画面を防ぐ）
	}
	return emptyState();
};

export const saveState = (state: ScheduleState): void => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// 保存できなくても動作は継続する
	}
};
