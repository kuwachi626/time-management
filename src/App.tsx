import React, { useState, useEffect, useMemo, type ChangeEvent } from "react";
import {
	applyShifts,
	deltaTo,
	emptyState,
	formatDuration,
	formatOffset,
	hasAdjustments,
	loadState,
	parseCsv,
	resetAdjustments,
	saveState,
	secondsToTimeInput,
	shiftEnd,
	shiftStart,
	stateFromItems,
	timeToSeconds,
	type ScheduleState,
} from "./schedule";

interface Notice {
	type: "info" | "error";
	text: string;
}

// 調整用クイックボタン（分）
const STEPS = [-5, -1, 1, 5];

interface AdjustRowProps {
	label: string;
	timeSec: number;
	onShift: (deltaSec: number) => void;
	onSet: (targetSec: number) => void;
}

/** 時刻をずらす／直接指定する1行分のコントロール */
const AdjustRow: React.FC<AdjustRowProps> = ({
	label,
	timeSec,
	onShift,
	onSet,
}) => (
	<div className="flex items-center gap-1.5 flex-wrap">
		<span className="text-[10px] font-black tracking-widest uppercase text-slate-400 w-8 shrink-0">
			{label}
		</span>
		<input
			type="time"
			value={secondsToTimeInput(timeSec)}
			onChange={(e) => {
				const target = timeToSeconds(e.target.value);
				if (target !== null) onSet(target);
			}}
			className="bg-slate-800 text-white text-xs font-mono rounded px-2 py-1 border border-white/10"
		/>
		{STEPS.map((minutes) => (
			<button
				key={minutes}
				type="button"
				onClick={() => onShift(minutes * 60)}
				className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded px-2 py-1 tabular-nums transition-colors"
			>
				{minutes > 0 ? `+${minutes}` : `${minutes}`}
			</button>
		))}
	</div>
);

const App: React.FC = () => {
	const [now, setNow] = useState<Date>(new Date());
	const [menuOpen, setMenuOpen] = useState(false);
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);

	// LocalStorageから初期データを取得（旧形式からの移行つき）
	const [state, setState] = useState<ScheduleState>(loadState);

	// タイマー更新
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	// データ保存
	useEffect(() => {
		saveState(state);
	}, [state]);

	// 元データ(base)に調整(shifts/stretch)を適用した表示用スケジュール。
	// nowSec を依存に含めない（現在行の判定を参照一致で行っているため）
	const schedule = useMemo(() => applyShifts(state), [state]);

	// CSV読み込み
	const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const input = e.target;
		const file = input.files?.[0];
		if (!file) return;

		// 同じファイルを選び直しても onChange が発火するようにクリアする
		const clearInput = () => {
			input.value = "";
		};

		if (
			state.base.length > 0 &&
			!window.confirm(
				"現在のスケジュールを置き換えます。よろしいですか？\n（調整した時間はリセットされます）",
			)
		) {
			clearInput();
			return;
		}

		const reader = new FileReader();
		reader.onerror = () => {
			clearInput();
			setNotice({ type: "error", text: "ファイルの読み込みに失敗しました" });
		};
		reader.onload = (event) => {
			clearInput();
			const text =
				typeof event.target?.result === "string" ? event.target.result : "";
			const { items, skipped } = parseCsv(text);

			if (items.length === 0) {
				setNotice({
					type: "error",
					text: "有効な行がありません。CSVの形式を確認してください",
				});
				return;
			}

			setState(stateFromItems(items, file.name));
			setOpenIndex(null);
			setNotice({
				type: "info",
				text:
					skipped > 0
						? `${items.length}件を読み込み（${skipped}件スキップ）`
						: `${items.length}件を読み込み`,
			});
		};
		reader.readAsText(file);
	};

	const handleClear = () => {
		if (state.base.length === 0) return;
		if (!window.confirm("スケジュールを削除します。よろしいですか？")) return;
		setState(emptyState());
		setOpenIndex(null);
		setNotice(null);
	};

	// 開始をずらす（所要時間は保ったまま、これ以降の回も連動）
	const adjustStart = (index: number, deltaSec: number) => {
		setState((prev) => shiftStart(prev, index, deltaSec));
	};

	// 終了をずらす（その回の所要時間が変わり、これ以降の回も連動）
	const adjustEnd = (index: number, deltaSec: number) => {
		setState((prev) => shiftEnd(prev, index, deltaSec));
	};

	// スケジュール判定
	const nowSec =
		now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

	const { current, next } = useMemo(() => {
		const currentTask = schedule.find(
			(item) => nowSec >= item.startSec && nowSec < item.endSec,
		);
		const nextTask = schedule.find((item) => item.startSec > nowSec);
		return { current: currentTask, next: nextTask };
	}, [nowSec, schedule]);

	const remainingTime = current ? current.endSec - nowSec : 0;
	const adjusted = hasAdjustments(state);

	return (
		<div className="h-[100svh] w-full flex flex-col font-sans overflow-hidden">
			{/* ヘッダー: コンパクト化 (viewport-fit=cover のためノッチ分を足す) */}
			<header className="flex justify-between items-center px-4 py-2 pt-[calc(0.5rem_+_env(safe-area-inset-top))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] bg-slate-900 shrink-0 border-b border-white/10">
				<div className="flex items-center gap-3 min-w-0">
					<label className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold transition-colors shrink-0">
						<span>CSVアップロード</span>
						<input
							type="file"
							accept=".csv"
							onChange={handleFileUpload}
							className="hidden"
						/>
					</label>
					{notice && (
						<span
							className={`text-xs font-bold truncate ${
								notice.type === "error"
									? "text-red-400"
									: "text-slate-400"
							}`}
						>
							{notice.text}
						</span>
					)}
				</div>
				<div className="flex items-center gap-4">
					<button
						onClick={handleClear}
						className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-bold uppercase transition-colors"
					>
						Clear
					</button>
					<div className="text-2xl text-white font-mono font-bold tabular-nums">
						{now.toLocaleTimeString("ja-JP", { hour12: false })}
					</div>
					{/* ハンバーガーメニューアイコン */}
					<button
						className="ml-2 flex flex-col justify-center items-center w-10 h-10 rounded hover:bg-slate-700 transition-colors"
						onClick={() => setMenuOpen(true)}
						aria-label="スケジュールを開く"
					>
						<span className="block w-6 h-0.5 bg-white mb-1"></span>
						<span className="block w-6 h-0.5 bg-white mb-1"></span>
						<span className="block w-6 h-0.5 bg-white"></span>
					</button>
				</div>
			</header>

			{/* サイドメニュー（スケジュール） */}
			{menuOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/30"
					onClick={() => setMenuOpen(false)}
					aria-label="メニューを閉じる背景"
				/>
			)}
			<div
				className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] bg-slate-900 z-50 flex flex-col
							transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
							${menuOpen ? "translate-x-0" : "translate-x-full"}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="shrink-0 p-4 border-b border-white/10 bg-slate-900">
					<div className="flex justify-between items-center">
						<p className="text-slate-200 font-black text-xs tracking-widest uppercase">
							Full Schedule
						</p>
						<button
							className="text-white text-2xl px-2"
							onClick={() => setMenuOpen(false)}
							aria-label="閉じる"
						>
							×
						</button>
					</div>
					<div className="flex justify-between items-center gap-2 mt-2">
						<p className="text-[11px] text-slate-400 truncate">
							{state.base.length > 0
								? `${state.fileName || "CSV"} / ${state.base.length}件`
								: "CSV未読込"}
						</p>
						{adjusted && (
							<button
								type="button"
								onClick={() => setState((prev) => resetAdjustments(prev))}
								className="shrink-0 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded px-2 py-1 transition-colors"
							>
								調整をリセット
							</button>
						)}
					</div>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
					{schedule.map((item, index) => {
						const isCurrent = current === item;
						const isOpen = openIndex === index;
						const offset = item.startSec - state.base[index].startSec;
						return (
							<div
								key={index}
								className={isOpen ? "bg-white/5 rounded" : undefined}
							>
								<button
									type="button"
									onClick={() => setOpenIndex(isOpen ? null : index)}
									className={`w-full flex justify-between items-center p-3 rounded text-left transition-colors ${
										isCurrent
											? "bg-blue-600 text-white"
											: "hover:bg-white/5 text-slate-200"
									}`}
								>
									<div className="flex gap-3 items-center min-w-0">
										<span className="text-[10px] w-8 shrink-0">
											{`${item.currentTimes}/${item.times}`}
										</span>
										<span className="text-sm font-bold truncate">
											{item.className}
										</span>
										{offset !== 0 && (
											<span className="shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5 bg-orange-500/20 text-orange-300">
												{formatOffset(offset)}
											</span>
										)}
									</div>
									<span className="text-xs font-mono font-bold shrink-0 ml-2">
										{`${item.start} - ${item.end}`}
									</span>
								</button>
								{isOpen && (
									<div className="px-3 pb-3 pt-1 space-y-2">
										<AdjustRow
											label="開始"
											timeSec={item.startSec}
											onShift={(delta) => adjustStart(index, delta)}
											onSet={(target) =>
												adjustStart(index, deltaTo(item.startSec, target))
											}
										/>
										<AdjustRow
											label="終了"
											timeSec={item.endSec}
											onShift={(delta) => adjustEnd(index, delta)}
											onSet={(target) =>
												adjustEnd(index, deltaTo(item.endSec, target))
											}
										/>
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() =>
													adjustStart(
														index,
														deltaTo(item.startSec, nowSec),
													)
												}
												className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded px-2 py-1 transition-colors"
											>
												この回を今から開始
											</button>
											<p className="text-[10px] text-slate-500">
												変更するとこれ以降も連動してずれます
											</p>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* メイン: スマホで縦、PCで横並び */}
			<main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
				{/* 左側: カウントダウン ＆ メイン情報 */}
				<div className="flex-1 flex flex-col p-6 lg:pb-10 lg:pr-10 lg:pl-10 lg:pt-5 justify-between border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden">
					{/* 現在のクラス情報 */}
					<div className="shrink-0">
						<p
							className={`${current ? "text-blue-500" : "text-slate-500"} font-black text-xs tracking-[0.3em] uppercase mb-2`}
						>
							{current ? "Now Session" : "Standby"}
						</p>
						<div className="flex items-baseline gap-4 flex-wrap">
							<span className="text-3xl lg:text-5xl font-black text-slate-500">
								{current
									? `${current.currentTimes}/${current.times}`
									: "--/--"}
							</span>
							<h2 className="text-4xl lg:text-7xl font-black uppercase tracking-tight break-words max-w-full">
								{current?.className || "No Data"}
							</h2>
						</div>
						<div className="text-4xl lg:text-3xl font-bold mt-2">
							{current ? `${current.start} - ${current.end}` : "Standby"}
						</div>
					</div>

					{/* カウントダウン: 画面幅に合わせてスケーリング (vwを使用) */}
					<div className="flex-1 flex items-center justify-center">
						<p
							className="font-mono font-black tabular-nums leading-none tracking-tighter"
							style={{ fontSize: "clamp(4rem, 22vw, 25rem)" }}
						>
							{formatDuration(remainingTime)}
						</p>
					</div>
				</div>
			</main>
			{/* フッター的なステータス */}
			<footer className="shrink-0 flex flex-col lg:flex-row lg:justify-center items-center border-t border-white/5 p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] bg-slate-800 text-white gap-1">
				<div className="flex items-center mb-1">
					<p className="text-orange-400 font-black text-[14px] tracking-widest uppercase mr-2">
						Next
					</p>
					<p className="text-2xl lg:text-3xl font-bold">
						{next?.className || "Finished"}
					</p>
				</div>
				<div className="flex items-center">
					<p className="text-slate-300 font-black text-[14px] tracking-widest uppercase mr-2">
						Time
					</p>
					<p className="text-2xl lg:text-3xl font-mono font-bold mr-4">
						{next ? `${next.start} ～ ${next.end}` : "--:-- ～ --:--"}
					</p>
					<p className="text-slate-400 font-black text-[14px] tracking-widest uppercase mr-2">
						Duration
					</p>
					<p className="text-2xl lg:text-3xl font-bold">
						{next?.duration || "--:--"}
					</p>
				</div>
			</footer>
		</div>
	);
};

export default App;
