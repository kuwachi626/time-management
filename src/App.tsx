import React, { useState, useEffect, useMemo, type ChangeEvent } from "react";

// --- 型定義 ---
interface ScheduleItem {
	currentTimes: string;
	times: string;
	className: string;
	start: string;
	end: string;
	duration: string;
	startSec: number;
	endSec: number;
}

// --- ヘルパー関数 ---
const timeToSeconds = (timeStr: string): number => {
	if (!timeStr) return 0;
	const [h, m] = timeStr.trim().split(":").map(Number);
	return h * 3600 + m * 60;
};

const formatDuration = (totalSeconds: number): string => {
	if (totalSeconds <= 0) return "00:00:00";
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

const App: React.FC = () => {
	const [now, setNow] = useState<Date>(new Date());
	const [menuOpen, setMenuOpen] = useState(false);

	// LocalStorageから初期データを取得
	const [schedule, setSchedule] = useState<ScheduleItem[]>(() => {
		const saved = localStorage.getItem("raceSchedule");
		return saved ? JSON.parse(saved) : [];
	});

	// タイマー更新
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	// データ保存
	useEffect(() => {
		localStorage.setItem("raceSchedule", JSON.stringify(schedule));
	}, [schedule]);

	// CSV読み込み (新フォーマット対応)
	const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			const lines = text.split(/\r?\n/).slice(1); // ヘッダーを飛ばす

			const data: ScheduleItem[] = lines
				.map((line) => {
					const [
						currentTimes,
						times,
						className,
						start,
						end,
						duration,
					] = line.split(",");
					if (!currentTimes || !times || !className || !start || !end)
						return null;

					return {
						currentTimes: currentTimes.trim(),
						times: times.trim(),
						className: className.trim(),
						start: start.trim(),
						end: end.trim(),
						duration: duration?.trim() || "",
						startSec: timeToSeconds(start),
						endSec: timeToSeconds(end),
					};
				})
				.filter((item): item is ScheduleItem => item !== null)
				.sort((a, b) => a.startSec - b.startSec);

			setSchedule(data);
		};
		reader.readAsText(file);
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

	return (
		<div className="h-[100svh] w-full flex flex-col font-sans overflow-hidden">
			{/* ヘッダー: コンパクト化 */}
			<header className="flex justify-between items-center px-4 py-2 bg-slate-900 shrink-0 border-b border-white/10">
				<div className="flex items-center gap-4">
					<label className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold transition-colors">
						<span>CSVアップロード</span>
						<input
							type="file"
							accept=".csv"
							onChange={handleFileUpload}
							className="hidden"
						/>
					</label>
				</div>
				<div className="flex items-center gap-4">
					<button
						onClick={() => setSchedule([])}
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
				className={`fixed top-0 right-0 h-full max-w-[90vw] bg-slate-900 z-50 
							transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
							${menuOpen ? "translate-x-0" : "translate-x-full"}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex justify-between items-center p-4 border-b border-white/10 bg-slate-900">
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
				<div className="flex-1 overflow-y-auto p-2 space-y-1 h-[calc(100vh-56px)]">
					{schedule.map((item, index) => {
						const isCurrent = current === item;
						return (
							<div
								key={index}
								className={`flex justify-between items-center p-3 rounded transition-colors ${
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
								</div>
								<span className="text-xs font-mono font-bold shrink-0 ml-2">
									{`${item.start} - ${item.end}`}
								</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* メイン: スマホで縦、PCで横並び */}
			<main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
				{/* 左側: カウントダウン ＆ メイン情報 */}
				<div className="flex-1 flex flex-col p-6 lg:p-10 justify-between border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden">
					{/* 現在のクラス情報 */}
					<div className="shrink-0">
						<p
							className={`${current ? "text-blue-500" : "text-slate-500"} font-black text-xs tracking-[0.3em] uppercase mb-2`}
						>
							{current ? "Now Session" : "Standby"}
						</p>
						<div className="flex items-baseline gap-4 flex-wrap">
							<span className="text-3xl lg:text-5xl font-black text-slate-500">
								{`${current?.currentTimes}/${current?.times || "--"}`}
							</span>
							<h2 className="text-4xl lg:text-7xl font-black uppercase tracking-tight break-words max-w-full">
								{current?.className || "No Data"}
							</h2>
						</div>
						<div className="text-4xl lg:text-3xl font-bold mt-2">
							{current
								? `${current.start} - ${current.end}`
								: "Standby"}
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
			<footer className="shrink-0 flex flex-col lg:flex-row lg:justify-center items-center border-t border-white/5 p-4 bg-slate-800 text-white gap-1">
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
						{next
							? `${next.start} ～ ${next.end}`
							: "--:-- ～ --:--"}
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
